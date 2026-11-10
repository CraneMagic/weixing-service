#!/bin/bash
# Formal release: pushed Git commit -> committed snapshot -> multi-platform registry image.
set -euo pipefail

SCRIPT_DIR=$(CDPATH= cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)
cd "$SCRIPT_DIR"
IMAGE_NAME="${PWD##*/}"
REGISTRY="registry.yijunstudio.xyz/"
PLATFORMS="linux/amd64,linux/arm64"
IMAGE_TAG="latest"
BUILDER_NAME="${WEIXING_BUILDER:-multiarch-builder}"
BUILD_CONTEXT=""
die() { echo "错误：$*" >&2; exit 1; }
cleanup() {
    if [[ -n "$BUILD_CONTEXT" && -d "$BUILD_CONTEXT" ]]; then rm -rf -- "$BUILD_CONTEXT"; fi
}
trap cleanup EXIT

while [[ $# -gt 0 ]]; do
    case "$1" in
        -p|--platform|-t|--tag|-r|--registry|-n|--name)
            [[ $# -ge 2 && -n "$2" ]] || die "$1 缺少参数"
            case "$1" in
                -p|--platform) PLATFORMS="$2" ;;
                -t|--tag) IMAGE_TAG="$2" ;;
                -r|--registry) REGISTRY="$2" ;;
                -n|--name) IMAGE_NAME="$2" ;;
            esac
            shift 2 ;;
        --push) shift ;; # 保留旧调用兼容性；正式发布始终推送镜像。
        *) die "未知参数: $1" ;;
    esac
done
[[ -n "$REGISTRY" ]] || die "必须指定镜像仓库"
REGISTRY="${REGISTRY%/}/"
command -v git >/dev/null || die "需要 Git"
git rev-parse --is-inside-work-tree >/dev/null 2>&1 || die "必须在 Git 仓库中发布"
if [[ -n "$(git status --porcelain --untracked-files=all)" ]]; then
    git status --short >&2
    die "存在未提交或未跟踪文件。请只提交本次相关文件并推送；禁止发布 dirty 工作区。"
fi
REVISION=$(git rev-parse --verify HEAD)
SHORT_REVISION=$(git rev-parse --short=12 HEAD)
BRANCH=$(git symbolic-ref --quiet --short HEAD) || die "请在有上游的分支发布，不能使用 detached HEAD"
REMOTE=$(git config --get "branch.${BRANCH}.remote") || die "当前分支没有上游，请先 git push -u"
REMOTE_REF=$(git config --get "branch.${BRANCH}.merge") || die "当前分支没有上游引用"
[[ "$REMOTE" != "." ]] || die "上游必须是远端仓库，不能是本地分支"
git fetch --quiet "$REMOTE" "$REMOTE_REF" || die "无法核验远端提交，发布终止"
git merge-base --is-ancestor "$REVISION" FETCH_HEAD || die "当前 commit 尚未推送到上游，请先 git push"
echo "代码已推送并核验: ${BRANCH} ${REVISION}"

command -v docker >/dev/null || die "需要 Docker / Buildx"
BUILT_AT=$(date -u +%Y-%m-%dT%H:%M:%SZ)
VERSION="$(TZ=Asia/Shanghai date +%Y.%m.%d)-${SHORT_REVISION}"
FULL_IMAGE_NAME="${REGISTRY}${IMAGE_NAME}:${IMAGE_TAG}"
VERSION_IMAGE_NAME="${REGISTRY}${IMAGE_NAME}:${VERSION}"
LATEST_IMAGE_NAME="${REGISTRY}${IMAGE_NAME}:latest"
RELEASE_REFS=("$VERSION_IMAGE_NAME" "$LATEST_IMAGE_NAME")
if [[ "$FULL_IMAGE_NAME" != "$VERSION_IMAGE_NAME" && "$FULL_IMAGE_NAME" != "$LATEST_IMAGE_NAME" ]]; then
    RELEASE_REFS+=("$FULL_IMAGE_NAME")
fi
TAG_ARGS=()
for image_ref in "${RELEASE_REFS[@]}"; do TAG_ARGS+=(-t "$image_ref"); done
# 从已推送的 commit 导出源码，不使用工作区、手工 tar 排除规则或未跟踪配置。
BUILD_CONTEXT=$(mktemp -d "${TMPDIR:-/tmp}/weixing-release.XXXXXXXX")
git archive "$REVISION" | tar -xf - -C "$BUILD_CONTEXT"

if ! docker buildx inspect "$BUILDER_NAME" >/dev/null 2>&1; then
    CREATE_ARGS=(--name "$BUILDER_NAME" --driver docker-container)
    BUILD_HTTP_PROXY="${WEIXING_BUILDKIT_HTTP_PROXY:-${HTTP_PROXY:-}}"
    BUILD_HTTPS_PROXY="${WEIXING_BUILDKIT_HTTPS_PROXY:-${HTTPS_PROXY:-$BUILD_HTTP_PROXY}}"
    if [[ -n "$BUILD_HTTP_PROXY" ]]; then CREATE_ARGS+=(--driver-opt "env.HTTP_PROXY=$BUILD_HTTP_PROXY"); fi
    if [[ -n "$BUILD_HTTPS_PROXY" ]]; then CREATE_ARGS+=(--driver-opt "env.HTTPS_PROXY=$BUILD_HTTPS_PROXY"); fi
    if [[ -n "${NO_PROXY:-}" ]]; then CREATE_ARGS+=(--driver-opt "env.NO_PROXY=$NO_PROXY"); fi
    docker buildx create "${CREATE_ARGS[@]}"
fi
# 显式指定构建器，不改变用户当前选择，也不在结束时删除共享缓存。
docker buildx inspect "$BUILDER_NAME" --bootstrap >/dev/null
docker buildx build --builder "$BUILDER_NAME" --platform "$PLATFORMS" \
    "${TAG_ARGS[@]}" \
    --label "com.weixing.build=1" \
    --label "org.opencontainers.image.revision=$REVISION" \
    --label "org.opencontainers.image.created=$BUILT_AT" \
    --label "org.opencontainers.image.version=$VERSION" \
    --push "$BUILD_CONTEXT"

# 核对所有远端标签的摘要与平台，包括显式单平台和额外别名。
VERSION_INFO=$(docker buildx imagetools inspect "$VERSION_IMAGE_NAME")
VERSION_DIGEST=$(printf '%s\n' "$VERSION_INFO" | sed -n 's/^Digest:[[:space:]]*//p')
[[ -n "$VERSION_DIGEST" ]] || die "无法读取远端版本摘要"
IFS=',' read -r -a PLATFORM_LIST <<< "$PLATFORMS"
for image_ref in "${RELEASE_REFS[@]}"; do
    IMAGE_INFO=$(docker buildx imagetools inspect "$image_ref")
    IMAGE_DIGEST=$(printf '%s\n' "$IMAGE_INFO" | sed -n 's/^Digest:[[:space:]]*//p')
    [[ "$VERSION_DIGEST" == "$IMAGE_DIGEST" ]] || die "远端标签摘要不一致: $image_ref"
    for platform in "${PLATFORM_LIST[@]}"; do
        if printf '%s\n' "$IMAGE_INFO" | grep -F 'Platform:' | grep -F -- "$platform" >/dev/null; then
            continue
        fi
        # 单个 OCI image manifest 没有 Platform 行，直接读取 image config。
        [[ ${#PLATFORM_LIST[@]} -eq 1 ]] || die "镜像 $image_ref 缺少平台: $platform"
        SINGLE_PLATFORM=$(docker buildx imagetools inspect "$image_ref" --format '{{.Image.OS}}/{{.Image.Architecture}}') || die "无法读取镜像平台: $image_ref"
        [[ "$SINGLE_PLATFORM" == "$platform" ]] || die "镜像 $image_ref 平台不符: ${SINGLE_PLATFORM}，要求 ${platform}"
    done
done

if [[ -n "${FLEET_API_URL:-}" && -n "${FLEET_TOKEN:-}" ]]; then
    if ! curl -fsS -m 10 -X POST "${FLEET_API_URL%/}/api/releases" \
        -H "Content-Type: application/json" -H "X-Fleet-Token: ${FLEET_TOKEN}" \
        -d "{\"image\":\"${REGISTRY}${IMAGE_NAME}\",\"version\":\"${VERSION}\",\"revision\":\"${REVISION}\",\"builtAt\":\"${BUILT_AT}\"}" >/dev/null; then
        echo "警告：镜像已推送，但设备看板版本登记失败" >&2
    fi
fi
printf '镜像已推送并核验: %s\n版本镜像: %s\nlatest: %s\n摘要: %s\n平台: %s\n现场部署: 未执行\n' \
    "$FULL_IMAGE_NAME" "$VERSION_IMAGE_NAME" "$LATEST_IMAGE_NAME" "$VERSION_DIGEST" "$PLATFORMS"

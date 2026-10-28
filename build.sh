#!/bin/bash
set -eo pipefail

# 默认配置
DEFAULT_PLATFORM="linux/amd64"
IMAGE_NAME="${PWD##*/}"  # 默认为当前目录名
REGISTRY="registry.yijunstudio.xyz/" # 私有仓库
PUSH_IMAGE=true

# 解析命令行参数
while [[ $# -gt 0 ]]; do
    case "$1" in
        -p|--platform)
            PLATFORMS="$2"
            shift; shift
            ;;
        -t|--tag)
            IMAGE_TAG="$2"
            shift; shift
            ;;
        --push)
            PUSH_IMAGE=true
            shift
            ;;
        -r|--registry)
            REGISTRY="$2"
            shift; shift
            ;;
        -n|--name)
            IMAGE_NAME="$2"
            shift; shift
            ;;
        *)
            echo "未知参数: $1"
            exit 1
            ;;
    esac
done

# 设置默认值
IMAGE_TAG=${IMAGE_TAG:-latest}
PLATFORMS=${PLATFORMS:-$DEFAULT_PLATFORM}
FULL_IMAGE_NAME="${REGISTRY}${IMAGE_NAME}:${IMAGE_TAG}"

# ==================== 版本信息（设备看板用） ====================
REVISION=$(git rev-parse --short=7 HEAD 2>/dev/null || echo "")
if [[ -n "$REVISION" && -n "$(git status --porcelain 2>/dev/null)" ]]; then
    REVISION="${REVISION}-dirty"
fi
BUILT_AT=$(date -u +%Y-%m-%dT%H:%M:%SZ)
VERSION="$(date +%Y.%m.%d)-${REVISION:-nogit}"
LABEL_ARGS=(
    --label "com.weixing.build=1"
    --label "org.opencontainers.image.revision=${REVISION}"
    --label "org.opencontainers.image.created=${BUILT_AT}"
    --label "org.opencontainers.image.version=${VERSION}"
)
echo "🏷️  版本: ${VERSION}"

# 除 latest 外再推一个版本 tag（与设备看板、镜像 label 显示的版本一致），
# latest 被覆盖后仍可按版本拉取旧镜像回滚
VERSION_IMAGE_NAME="${REGISTRY}${IMAGE_NAME}:${VERSION}"
TAG_ARGS=(-t "$FULL_IMAGE_NAME" -t "$VERSION_IMAGE_NAME")

# 推送成功后登记最新版本；未配置 FLEET_API_URL / FLEET_TOKEN 时跳过，失败不影响构建
register_release() {
    if [[ -z "${FLEET_API_URL:-}" || -z "${FLEET_TOKEN:-}" ]]; then
        echo "⚠️  未设置 FLEET_API_URL / FLEET_TOKEN，跳过版本登记"
        return 0
    fi
    if curl -fsS -m 10 -X POST "${FLEET_API_URL%/}/api/releases" \
        -H "Content-Type: application/json" \
        -H "X-Fleet-Token: ${FLEET_TOKEN}" \
        -d "{\"image\":\"${REGISTRY}${IMAGE_NAME}\",\"version\":\"${VERSION}\",\"revision\":\"${REVISION}\",\"builtAt\":\"${BUILT_AT}\"}" \
        >/dev/null; then
        echo "📌 已登记最新版本: ${VERSION}"
    else
        echo "⚠️  登记最新版本失败（不影响构建）"
    fi
}

# 验证参数
if [[ "$PUSH_IMAGE" == "true" && -z "$REGISTRY" ]]; then
    echo "错误：推送镜像必须设置REGISTRY！"
    exit 1
fi

# 使用新的唯一名称（例如添加时间戳）
BUILDER_NAME="multiarch-builder"

# 函数：创建或复用构建器
prepare_builder() {
    if ! docker buildx inspect "$BUILDER_NAME" &>/dev/null; then
        docker buildx create --name "$BUILDER_NAME" --use
        docker buildx inspect --bootstrap
    else
        docker buildx use "$BUILDER_NAME"
    fi
}

# 函数：清理构建器
cleanup_builder() {
    echo "🧹 清理构建器..."
    docker buildx rm "$BUILDER_NAME" || true
}

# 注册退出时清理的钩子
trap cleanup_builder EXIT

# 执行构建
if [[ "$PLATFORMS" == *,* ]]; then
    # 多平台构建模式
    prepare_builder
    docker buildx build \
        --platform "$PLATFORMS" \
        "${TAG_ARGS[@]}" \
        "${LABEL_ARGS[@]}" \
        --push \
        .
    
    echo "✅ 多平台构建完成并推送至仓库"
    register_release
    echo "镜像地址：$FULL_IMAGE_NAME（版本 tag：$VERSION_IMAGE_NAME）"
else
    # 单平台构建模式
    docker build \
        --platform "$PLATFORMS" \
        "${TAG_ARGS[@]}" \
        "${LABEL_ARGS[@]}" \
        .
    
    if [[ "$PUSH_IMAGE" == "true" ]]; then
        docker push "$FULL_IMAGE_NAME"
        docker push "$VERSION_IMAGE_NAME"
        echo "✅ 单平台镜像已推送至仓库"
        register_release

        # 推送成功后删除本地镜像，释放磁盘空间
        docker rmi "$FULL_IMAGE_NAME" "$VERSION_IMAGE_NAME" 2>/dev/null && \
            echo "🗑️  已删除本地镜像: $FULL_IMAGE_NAME" || \
            echo "⚠️  删除本地镜像失败（可能已被删除）"
    fi
fi

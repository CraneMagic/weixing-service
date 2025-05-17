#!/bin/bash
set -eo pipefail

# 默认配置
DEFAULT_PLATFORM="linux/amd64"
IMAGE_NAME="${PWD##*/}"  # 默认为当前目录名
REGISTRY="yijun9124/" # 默认不上传，如需上传设为 registry.example.com/username/
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
        -n|--name)
            IMAGE_NAME="$2"  # 如果传入参数，则使用该名称
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
        -t "$FULL_IMAGE_NAME" \
        --push \
        .
    
    echo "✅ 多平台构建完成并推送至仓库"
    echo "镜像地址：$FULL_IMAGE_NAME"
else
    # 单平台构建模式
    docker build \
        --platform "$PLATFORMS" \
        -t "$FULL_IMAGE_NAME" \
        .
    
    if [[ "$PUSH_IMAGE" == "true" ]]; then
        docker push "$FULL_IMAGE_NAME"
        echo "✅ 单平台镜像已推送至仓库"
    fi
    
    # 运行容器（仅本地）
    echo "🚀 启动容器..."
    docker run -d \
        --platform "$PLATFORMS" \
        -p 8080:8080 \
        --name "${IMAGE_NAME}-container" \
        "$FULL_IMAGE_NAME"
fi

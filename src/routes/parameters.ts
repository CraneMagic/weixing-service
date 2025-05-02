import express from "express";
import { z } from "zod";
import {
  saveParameter,
  getParameter,
  getAllParameters,
  deleteParameter,
  getNestedParameter,
  updateNestedParameter,
} from "../services/db";
import { logger } from "../utils/logger";

// 参数验证模式
const parameterSchema = z.object({
  key: z.string().min(1).max(100),
  value: z.any(),
});

// 嵌套参数验证模式
const nestedParameterSchema = z.object({
  key: z.string().min(1).max(100),
  path: z.string().min(1),
  value: z.any(),
});

/**
 * 设置参数管理路由
 */
export function setupParametersRoutes(): express.Router {
  const router = express.Router();

  // 获取所有参数
  router.get("/", async (req, res) => {
    try {
      const parameters = await getAllParameters();
      res.json(parameters);
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      logger.error(`获取所有参数失败: ${errorMessage}`);
      res.status(500).json({ error: errorMessage });
    }
  });

  // 获取单个参数
  router.get("/:key", async (req, res) => {
    try {
      const { key } = req.params;
      const parameter = await getParameter(key);

      if (!parameter) {
        return res.status(404).json({ error: `参数 ${key} 不存在` });
      }

      res.json(parameter);
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      logger.error(`获取参数失败: ${errorMessage}`);
      res.status(500).json({ error: errorMessage });
    }
  });

  // 获取嵌套参数
  router.get("/:key/:path(*)", async (req, res) => {
    try {
      const { key, path } = req.params;
      const value = await getNestedParameter(key, path);

      if (value === undefined || value === null) {
        return res.status(404).json({ error: `参数 ${key}.${path} 不存在` });
      }

      res.json({ key, path, value });
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      logger.error(`获取嵌套参数失败: ${errorMessage}`);
      res.status(500).json({ error: errorMessage });
    }
  });

  // 创建或更新参数
  router.post("/", async (req, res) => {
    try {
      const validation = parameterSchema.safeParse(req.body);

      if (!validation.success) {
        return res.status(400).json({
          error: "参数验证失败",
          details: validation.error.format(),
        });
      }

      const { key, value } = req.body;
      const result = await saveParameter(key, value);

      res.status(200).json(result);
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      logger.error(`保存参数失败: ${errorMessage}`);
      res.status(500).json({ error: errorMessage });
    }
  });

  // 更新嵌套参数
  router.post("/nested", async (req, res) => {
    try {
      const validation = nestedParameterSchema.safeParse(req.body);

      if (!validation.success) {
        return res.status(400).json({
          error: "参数验证失败",
          details: validation.error.format(),
        });
      }

      const { key, path, value } = req.body;
      const result = await updateNestedParameter(key, path, value);

      res.status(200).json(result);
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      logger.error(`更新嵌套参数失败: ${errorMessage}`);
      res.status(500).json({ error: errorMessage });
    }
  });

  // 删除参数
  router.delete("/:key", async (req, res) => {
    try {
      const { key } = req.params;
      const numRemoved = await deleteParameter(key);

      if (numRemoved === 0) {
        return res.status(404).json({ error: `参数 ${key} 不存在` });
      }

      res.json({ success: true, message: `参数 ${key} 已删除` });
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      logger.error(`删除参数失败: ${errorMessage}`);
      res.status(500).json({ error: errorMessage });
    }
  });

  // 批量更新参数
  router.post("/batch", async (req, res) => {
    try {
      if (!Array.isArray(req.body)) {
        return res.status(400).json({ error: "请求体必须是参数数组" });
      }

      const results = [];
      for (const param of req.body) {
        const validation = parameterSchema.safeParse(param);

        if (!validation.success) {
          return res.status(400).json({
            error: "参数验证失败",
            details: validation.error.format(),
            parameter: param,
          });
        }

        const { key, value } = param;
        const result = await saveParameter(key, value);
        results.push(result);
      }

      res.status(200).json(results);
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      logger.error(`批量更新参数失败: ${errorMessage}`);
      res.status(500).json({ error: errorMessage });
    }
  });

  return router;
}

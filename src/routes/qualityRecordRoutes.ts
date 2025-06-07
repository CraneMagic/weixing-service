import { Router } from "express";
import {
  createQualityRecord,
  getQualityRecords,
  getQualityRecord,
  updateQualityRecord,
  deleteQualityRecord,
} from "../controllers/qualityRecordController";

const router = Router();

// 创建质量检测记录
router.post("/", createQualityRecord);

// 获取质量检测记录列表
router.get("/", getQualityRecords);

// 获取单条质量检测记录
router.get("/:client_ip/:timestamp", getQualityRecord);

// 更新质量检测记录
router.put("/:client_ip/:timestamp", updateQualityRecord);

// 删除质量检测记录
router.delete("/:client_ip/:timestamp", deleteQualityRecord);

export default router;

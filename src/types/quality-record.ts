export interface QualityRecord {
  client_ip: string;
  timestamp: string;
  capture_time?: string;
  model_type?: string;
  label?: string;
  confidence?: number;
  frame_id?: number;
  fis?: number;
  fps?: number;
  filename?: string;
  resolution?: string;
  size_bytes?: number;
  size_formatted?: string;
  jpeg_quality?: number;
  inference_time_ms?: number;
  capture_time_ms?: number;
  jpeg_encode_time_ms?: number;
  image?: string | null;
  message_id?: string;
  object_key?: string;
  status?: string;
  pc_num?: string;
  // 新增字段
  error_path?: string | null;
  oss_path?: string | null;
  // 审核相关字段
  review_result?: string; // pass/fail/unclear
  review_time?: string; // 审核时间
  reviewer?: string; // 审核人
  review_notes?: string; // 审核备注
  model_version?: string; // 模型版本
  has_code?: boolean; // 是否有喷码
  code_confidence?: number; // 喷码置信度
}

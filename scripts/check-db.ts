import dotenv from "dotenv";
import pool from "../src/services/pg-pool";
import { logger } from "../src/utils/logger";

dotenv.config();

async function checkDatabase() {
  try {
    logger.info("🔍 开始检查PostgreSQL数据库状态...");

    // 1. 测试连接
    const client = await pool.connect();
    logger.info("✅ 数据库连接成功");

    // 2. 检查数据库版本
    const versionResult = await client.query("SELECT version()");
    logger.info(
      `📊 PostgreSQL版本: ${versionResult.rows[0].version.split(" ")[0]} ${
        versionResult.rows[0].version.split(" ")[1]
      }`
    );

    // 3. 检查表是否存在
    const tablesResult = await client.query(`
      SELECT table_name, 
             (SELECT count(*) FROM information_schema.columns WHERE table_name = t.table_name) as column_count
      FROM information_schema.tables t
      WHERE table_schema = 'public' 
      ORDER BY table_name
    `);

    logger.info("📋 数据库表状态:");
    tablesResult.rows.forEach((row) => {
      logger.info(`  📄 表: ${row.table_name} (${row.column_count} 列)`);
    });

    // 4. 检查关键表结构
    const requiredTables = ["measurements", "quality_records"];
    const existingTables = tablesResult.rows.map((row) => row.table_name);

    for (const tableName of requiredTables) {
      if (existingTables.includes(tableName)) {
        // 检查表结构
        const columnsResult = await client.query(
          `
          SELECT column_name, data_type, is_nullable
          FROM information_schema.columns 
          WHERE table_name = $1 
          ORDER BY ordinal_position
        `,
          [tableName]
        );

        logger.info(`  🔧 表 ${tableName} 结构:`);
        columnsResult.rows.forEach((col) => {
          logger.info(
            `    • ${col.column_name}: ${col.data_type} ${
              col.is_nullable === "NO" ? "(必填)" : "(可选)"
            }`
          );
        });

        // 检查记录数量
        const countResult = await client.query(
          `SELECT COUNT(*) as count FROM ${tableName}`
        );
        logger.info(
          `  📊 表 ${tableName} 记录数: ${countResult.rows[0].count}`
        );
      } else {
        logger.error(`❌ 缺少必需的表: ${tableName}`);
      }
    }

    // 5. 检查索引
    const indexesResult = await client.query(`
      SELECT schemaname, tablename, indexname, indexdef
      FROM pg_indexes 
      WHERE schemaname = 'public' 
      AND tablename IN ('measurements', 'quality_records')
      ORDER BY tablename, indexname
    `);

    logger.info("🔗 数据库索引:");
    indexesResult.rows.forEach((idx) => {
      logger.info(`  📌 ${idx.tablename}.${idx.indexname}`);
    });

    // 6. 检查连接池状态
    logger.info(
      `🏊 连接池状态: 总连接=${pool.totalCount}, 空闲=${pool.idleCount}, 等待=${pool.waitingCount}`
    );

    client.release();
    logger.info("🎉 数据库检查完成，状态正常");

    // 检查结果汇总
    const missingTables = requiredTables.filter(
      (table) => !existingTables.includes(table)
    );
    if (missingTables.length > 0) {
      logger.error(`🚨 检查失败: 缺少表 ${missingTables.join(", ")}`);
      process.exit(1);
    } else {
      logger.info("✅ 所有必需的表都存在");
      process.exit(0);
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error(`❌ 数据库检查失败: ${errorMessage}`);
    process.exit(1);
  }
}

checkDatabase();

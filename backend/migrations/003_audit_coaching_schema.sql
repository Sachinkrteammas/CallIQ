-- 003_audit_coaching_schema.sql
-- Schema required by the audit / prompt / coaching changes.
-- Safe to run more than once against the `call_audit` database.
--
-- What changed in the application:
--   * audit worker writes sale_category / invalid_reason / crm_sale_done /
--     customer_confirmation / order_information on call_audits + call_logs
--   * coaching CRUD now persists to the coaching_queue table
--     (it used to live only in process memory)
--   * AI prompt create/update uses the existing ai_prompts table

-- ---------------------------------------------------------------------------
-- 1. coaching_queue  (NEW requirement for persisted coaching items)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS coaching_queue (
  id INT AUTO_INCREMENT PRIMARY KEY,
  agent_id VARCHAR(20) NOT NULL,
  agent_name VARCHAR(255) NOT NULL,
  team VARCHAR(100) DEFAULT NULL,
  status VARCHAR(50) DEFAULT 'Needs Coaching',
  recommendation TEXT,
  estimated_improvement VARCHAR(255) DEFAULT NULL,
  evidence TEXT,
  score_at_flag DECIMAL(5,1) DEFAULT NULL,
  reason VARCHAR(255) DEFAULT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ---------------------------------------------------------------------------
-- 2. ai_prompts  (already used by the app; included for a fresh database)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS ai_prompts (
  id INT AUTO_INCREMENT PRIMARY KEY,
  client_id INT NULL,
  name VARCHAR(255) NOT NULL,
  description TEXT NULL,
  version VARCHAR(64) NULL,
  status VARCHAR(32) DEFAULT 'Draft',
  prompt_json JSON NOT NULL,
  prompt_text LONGTEXT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_ai_prompts_client (client_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ---------------------------------------------------------------------------
-- 3. audit result columns (idempotent helper; MySQL 8 has no
--    "ADD COLUMN IF NOT EXISTS", so we check information_schema first)
-- ---------------------------------------------------------------------------
DROP PROCEDURE IF EXISTS _add_column_if_missing;

DELIMITER $$

CREATE PROCEDURE _add_column_if_missing(
  IN p_table VARCHAR(64),
  IN p_column VARCHAR(64),
  IN p_definition VARCHAR(255)
)
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = p_table
      AND COLUMN_NAME = p_column
  ) THEN
    SET @ddl = CONCAT(
      'ALTER TABLE `', p_table, '` ADD COLUMN `', p_column, '` ', p_definition
    );
    PREPARE stmt FROM @ddl;
    EXECUTE stmt;
    DEALLOCATE PREPARE stmt;
  END IF;
END $$

DELIMITER ;

-- call_audits
CALL _add_column_if_missing('call_audits', 'sale_category',        "VARCHAR(50) DEFAULT 'Unknown'");
CALL _add_column_if_missing('call_audits', 'invalid_reason',       'VARCHAR(255) DEFAULT NULL');
CALL _add_column_if_missing('call_audits', 'crm_sale_done',        'BOOLEAN DEFAULT FALSE');
CALL _add_column_if_missing('call_audits', 'customer_confirmation',"VARCHAR(50) DEFAULT 'Not Confirmed'");
CALL _add_column_if_missing('call_audits', 'order_information',    "VARCHAR(50) DEFAULT 'Not Available'");

-- call_logs (kept in sync by the audit worker)
CALL _add_column_if_missing('call_logs', 'sale_category',        "VARCHAR(50) DEFAULT 'Unknown'");
CALL _add_column_if_missing('call_logs', 'invalid_reason',       'VARCHAR(255) DEFAULT NULL');
CALL _add_column_if_missing('call_logs', 'crm_sale_done',        'BOOLEAN DEFAULT FALSE');
CALL _add_column_if_missing('call_logs', 'customer_confirmation',"VARCHAR(50) DEFAULT 'Not Confirmed'");
CALL _add_column_if_missing('call_logs', 'order_information',    "VARCHAR(50) DEFAULT 'Not Available'");

DROP PROCEDURE IF EXISTS _add_column_if_missing;

-- ---------------------------------------------------------------------------
-- 4. Verification (run manually)
-- ---------------------------------------------------------------------------
-- SHOW TABLES LIKE 'coaching_queue';
-- SHOW COLUMNS FROM call_audits LIKE 'sale_category';
-- SHOW COLUMNS FROM call_logs   LIKE 'order_information';
--
-- After deploying on a fresh database, populate the coaching queue once via:
--   POST /api/agents/coaching/auto-flag
-- (or leave it empty until a user clicks "Auto-flag" in the Coaching Center).

USE pos_db;
ALTER TABLE workflow_requests
  MODIFY COLUMN request_type ENUM('shift_checkin', 'stock_receipt', 'stock_usage', 'refund') NOT NULL;

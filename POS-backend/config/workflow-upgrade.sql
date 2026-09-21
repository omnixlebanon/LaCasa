-- Run this after employee-management.sql has already been applied.
ALTER TABLE users ADD COLUMN telegram_id VARCHAR(30) UNIQUE NULL AFTER access_level;

ALTER TABLE orders_history
  ADD COLUMN status ENUM('completed', 'refunded') NOT NULL DEFAULT 'completed',
  ADD COLUMN refund_reason VARCHAR(500) NULL,
  ADD COLUMN refund_evidence MEDIUMTEXT NULL,
  ADD COLUMN refunded_by INT NULL,
  ADD COLUMN refunded_at TIMESTAMP NULL,
  ADD CONSTRAINT fk_order_refunder FOREIGN KEY (refunded_by) REFERENCES users(user_id) ON DELETE SET NULL;

CREATE TABLE workflow_requests (
  request_id INT AUTO_INCREMENT PRIMARY KEY,
  user_id INT NOT NULL,
  request_type ENUM('shift_checkin', 'stock_receipt', 'stock_usage', 'refund') NOT NULL,
  payload JSON NOT NULL,
  status ENUM('pending', 'approved', 'rejected') NOT NULL DEFAULT 'pending',
  reviewed_by INT NULL,
  review_note VARCHAR(500) NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  reviewed_at TIMESTAMP NULL,
  bot_notified_at TIMESTAMP NULL,
  FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE CASCADE,
  FOREIGN KEY (reviewed_by) REFERENCES users(user_id) ON DELETE SET NULL,
  INDEX idx_workflow_status (status, created_at)
);

CREATE TABLE shift_checkins (
  checkin_id INT AUTO_INCREMENT PRIMARY KEY,
  user_id INT NOT NULL,
  shift_id INT NULL,
  checked_in_at TIMESTAMP NOT NULL,
  approved_by INT NOT NULL,
  FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE CASCADE,
  FOREIGN KEY (shift_id) REFERENCES shifts(shift_id) ON DELETE SET NULL,
  FOREIGN KEY (approved_by) REFERENCES users(user_id),
  INDEX idx_checkins_user_time (user_id, checked_in_at)
);

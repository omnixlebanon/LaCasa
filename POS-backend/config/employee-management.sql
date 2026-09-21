-- Run this once on the existing POS database.
ALTER TABLE users
  ADD COLUMN access_level ENUM('admin', 'employee') NOT NULL DEFAULT 'employee' AFTER user_position;


-- Promote the initial administrator after replacing the email below.
-- UPDATE users SET access_level = 'admin' WHERE user_email = 'admin@example.com';

CREATE TABLE shifts (
  shift_id INT AUTO_INCREMENT PRIMARY KEY,
  user_id INT NOT NULL,
  shift_date DATE NOT NULL,
  start_time TIME NOT NULL,
  end_time TIME NOT NULL,
  notes VARCHAR(255) NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_shifts_user FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE CASCADE,
  CONSTRAINT chk_shift_times CHECK (end_time > start_time),
  INDEX idx_shifts_user_date (user_id, shift_date)
);

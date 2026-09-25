CREATE TABLE IF NOT EXISTS business_expenses (
  expense_id BIGINT AUTO_INCREMENT PRIMARY KEY,
  category VARCHAR(30) NOT NULL,
  description VARCHAR(200) NOT NULL,
  amount DECIMAL(12,2) NOT NULL CHECK (amount > 0),
  expense_date DATE NOT NULL,
  recorded_by INT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_business_expense_date (expense_date),
  FOREIGN KEY (recorded_by) REFERENCES users(user_id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS expense_recurrences (
  expense_id BIGINT PRIMARY KEY,
  frequency VARCHAR(10) NOT NULL,
  repeat_until DATE NULL,
  stopped_before DATE NULL,
  FOREIGN KEY (expense_id) REFERENCES business_expenses(expense_id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS recurring_shifts (
  recurrence_id INT AUTO_INCREMENT PRIMARY KEY,
  user_id INT NOT NULL,
  month_days JSON NULL,
  weekdays JSON NULL,
  starts_on DATE NOT NULL,
  stopped_from DATE NULL,
  start_time TIME NOT NULL,
  end_time TIME NOT NULL,
  notes VARCHAR(255) NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE CASCADE,
  CHECK (end_time > start_time),
  INDEX idx_recurring_user (user_id, starts_on)
);

CREATE TABLE IF NOT EXISTS employee_salary_rates (
  user_id INT NOT NULL,
  effective_month DATE NOT NULL,
  monthly_salary DECIMAL(12,2) NOT NULL,
  updated_by INT NULL,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (user_id, effective_month),
  FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE CASCADE,
  FOREIGN KEY (updated_by) REFERENCES users(user_id) ON DELETE SET NULL,
  CHECK (monthly_salary >= 0)
);

CREATE TABLE IF NOT EXISTS salary_deductions (
  deduction_id INT AUTO_INCREMENT PRIMARY KEY,
  user_id INT NOT NULL,
  request_id INT NOT NULL,
  order_id VARCHAR(20) NOT NULL,
  amount DECIMAL(12,2) NOT NULL,
  deducted_at TIMESTAMP NOT NULL,
  UNIQUE KEY uq_deduction_request (request_id),
  UNIQUE KEY uq_deduction_employee_order (user_id, order_id),
  FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE CASCADE,
  FOREIGN KEY (request_id) REFERENCES workflow_requests(request_id) ON DELETE CASCADE,
  CHECK (amount >= 0),
  INDEX idx_deduction_month (user_id, deducted_at)
);

CREATE TABLE IF NOT EXISTS employee_payroll_payments (
  user_id INT NOT NULL,
  salary_month DATE NOT NULL,
  status ENUM('paid', 'unpaid') NOT NULL,
  amount_paid DECIMAL(12,2) NOT NULL DEFAULT 0,
  paid_at TIMESTAMP NULL,
  paid_by INT NULL,
  PRIMARY KEY (user_id, salary_month),
  FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE CASCADE,
  FOREIGN KEY (paid_by) REFERENCES users(user_id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS payroll_payment_events (
  event_id INT AUTO_INCREMENT PRIMARY KEY,
  user_id INT NOT NULL,
  salary_month DATE NOT NULL,
  status ENUM('paid', 'unpaid') NOT NULL,
  amount DECIMAL(12,2) NOT NULL,
  recorded_by INT NULL,
  recorded_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE CASCADE,
  FOREIGN KEY (recorded_by) REFERENCES users(user_id) ON DELETE SET NULL,
  INDEX idx_payment_events (user_id, salary_month)
);

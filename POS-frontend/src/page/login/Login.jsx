import { useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import { useNavigate } from 'react-router-dom';
import './Login.css'
const Login = () => {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const { login } = useAuth();
  const navigate = useNavigate();

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    const formData = new FormData(e.currentTarget);
    const submittedUsername = String(formData.get('username') || '').trim();
    const submittedPassword = String(formData.get('password') || '');
    const result = await login(submittedUsername, submittedPassword);
    if (result?.success) {
      navigate('/');
    } else {
      setError(result?.message || "Invalid credentials");
    }
  };

  return (
    <div className='login-area'>
      <div className='login-container'>
        <h2 className='login-head'>Welcome to {"{Cafe name}"}</h2>
        {error && <p className='error-message'>{error}</p>}
        <form className='login-form' onSubmit={handleSubmit}>
          <div className='login-label-input'>
            <label htmlFor="username">Username</label>
            <input id="username" name="username" type="text" autoComplete="username" value={username} required
              onChange={(e) => setUsername(e.target.value)} />
          </div>
          <div className='login-label-input'>
            <label htmlFor="password">Password</label>
            <input id="password" name="password" type="password" autoComplete="current-password" value={password} required
              onChange={(e) => setPassword(e.target.value)}/>
          </div>
          <button className='save-btn' type="submit" style={{ padding: '8px 16px', cursor: 'pointer' }}>Login</button>
        </form>
      </div>
    </div>
  );
};

export default Login;

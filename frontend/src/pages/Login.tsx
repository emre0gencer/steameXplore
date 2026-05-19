export default function Login() {
  const handleLogin = () => {
    window.location.href = `${import.meta.env.VITE_BACKEND_URL}/auth/steam`;
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100vh' }}>
      <h1>Steam Login</h1>
      <img
        src="/sits_01.png"
        alt="Sign in through Steam"
        onClick={handleLogin}
        style={{ cursor: 'pointer' }}
      />
    </div>
  );
}

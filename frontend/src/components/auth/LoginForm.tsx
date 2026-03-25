
import { useState } from "react";
import { signIn } from "aws-amplify/auth";

interface LoginFormProps {
  onLogin: () => void;
}

export default function LoginForm({ onLogin }: LoginFormProps) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");

  // real
  const handleLogin = async () => {
    try {
      const { isSignedIn } = await signIn({ 
        username: email, 
        password: password 
      });
      
      if (isSignedIn) {
        setTimeout(() => {
          onLogin();
        }, 100);
      }
    } catch (err: any) {
      console.error('Login error:', err);
      setError(err.message || "An error occurred during login");
    }
  };

  // === mock ===
  // const handleLogin = () => {
  //   // Keeping your original mock authentication logic
  //   if (!email.toLowerCase().startsWith("j")) {
  //     setError("Incorrect email or password, please check credentials");
  //     return;
  //   }

  //   setError("");
  //   onLogin();
  // };

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#09090b] text-white">
      <div className="bg-[#18181b] border border-zinc-800 p-8 rounded-2xl shadow-2xl w-full max-w-md">
        <h1 className="text-3xl font-bold mb-2 text-center text-white">Notiver CEIMS</h1>
        <p className="text-zinc-500 text-sm mb-8 text-center uppercase tracking-widest">
          Crime Intelligence Portal
        </p>

        <div className="space-y-4">
          <input
            type="email"
            placeholder="Email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full bg-zinc-900 border border-zinc-700 p-3 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none text-white"
          />

          <input
            type="password"
            placeholder="Password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="w-full bg-zinc-900 border border-zinc-700 p-3 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none text-white"
          />

          {error && (
            <p className="text-red-500 text-sm">{error}</p>
          )}

          <button
            onClick={handleLogin}
            className="w-full bg-indigo-600 hover:bg-indigo-500 py-3 rounded-lg font-bold transition-all"
          >
            Login
          </button>
        </div>
      </div>
    </div>
  );
}
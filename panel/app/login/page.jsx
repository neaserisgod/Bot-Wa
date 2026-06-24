'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

export default function LoginPage() {
  const router = useRouter();
  const [paso, setPaso] = useState('telefono'); // 'telefono' | 'codigo'
  const [telefono, setTelefono] = useState('');
  const [codigo, setCodigo] = useState('');
  const [recordar, setRecordar] = useState(true);
  const [error, setError] = useState('');
  const [aviso, setAviso] = useState('');
  const [cargando, setCargando] = useState(false);

  async function pedirCodigo(e) {
    e?.preventDefault();
    setError('');
    setAviso('');
    setCargando(true);
    try {
      const res = await fetch('/api/auth/solicitar-codigo', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ telefono }),
      });
      const data = await res.json();
      if (!data.ok) {
        setError(data.error || 'No se pudo enviar el código.');
        setCargando(false);
        return;
      }
      setPaso('codigo');
      setAviso('Te enviamos un código por WhatsApp. Revisá tu teléfono.');
    } catch {
      setError('Error de conexión.');
    }
    setCargando(false);
  }

  async function verificar(e) {
    e.preventDefault();
    setError('');
    setCargando(true);
    try {
      const res = await fetch('/api/auth/verificar-codigo', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ telefono, codigo, recordar }),
      });
      const data = await res.json();
      if (!data.ok) {
        setError(data.error || 'Código inválido.');
        setCargando(false);
        return;
      }
      router.replace('/');
      router.refresh();
    } catch {
      setError('Error de conexión.');
      setCargando(false);
    }
  }

  return (
    <div className="login-wrap">
      <div className="card login-card">
        <h1>Panel Nefertiti</h1>

        {paso === 'telefono' && (
          <form onSubmit={pedirCodigo}>
            <p className="muted" style={{ marginTop: 0 }}>
              Ingresá tu celular. Te mandamos un código por WhatsApp.
            </p>
            <div className="field">
              <label>Celular</label>
              <input
                inputMode="numeric"
                placeholder="549XXXXXXXXXX"
                value={telefono}
                onChange={(e) => setTelefono(e.target.value)}
                autoFocus
              />
            </div>
            <label className="row" style={{ gap: 8, marginBottom: 14 }}>
              <input
                type="checkbox"
                style={{ width: 'auto' }}
                checked={recordar}
                onChange={(e) => setRecordar(e.target.checked)}
              />
              <span>Mantener la sesión iniciada en este dispositivo</span>
            </label>
            {error && <p className="error">{error}</p>}
            <button className="btn primary" style={{ width: '100%' }} disabled={cargando}>
              {cargando ? 'Enviando…' : 'Enviar código'}
            </button>
          </form>
        )}

        {paso === 'codigo' && (
          <form onSubmit={verificar}>
            {aviso && <p className="ok">{aviso}</p>}
            <div className="field">
              <label>Código de 6 dígitos</label>
              <input
                inputMode="numeric"
                maxLength={6}
                placeholder="••••••"
                value={codigo}
                onChange={(e) => setCodigo(e.target.value.replace(/\D/g, ''))}
                autoFocus
                style={{ letterSpacing: '6px', textAlign: 'center', fontSize: 22 }}
              />
            </div>
            {error && <p className="error">{error}</p>}
            <button className="btn primary" style={{ width: '100%' }} disabled={cargando}>
              {cargando ? 'Verificando…' : 'Entrar'}
            </button>
            <div className="row" style={{ justifyContent: 'space-between', marginTop: 12 }}>
              <button type="button" className="btn ghost sm" onClick={() => setPaso('telefono')}>
                ← Cambiar número
              </button>
              <button type="button" className="btn ghost sm" onClick={() => pedirCodigo()} disabled={cargando}>
                Reenviar código
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}

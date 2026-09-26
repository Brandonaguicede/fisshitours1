import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';

import { clearRecoverySession, isRecoverySession, isSupabaseConfigured, supabase } from '../lib/supabase';
import '../styles/admin.css';

// Matches auth.minimum_password_length in supabase/config.toml.
const MIN_PASSWORD_LENGTH = 6;
const INVALID_LINK = 'This recovery link is invalid or has expired. Please request a new password recovery email.';

export default function UpdatePasswordPage() {
  const navigate = useNavigate();
  const [checking, setChecking] = useState(true);
  const [ready, setReady] = useState(false);
  const [newPassword, setNewPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [loading, setLoading] = useState(false);
  const [updated, setUpdated] = useState(false);
  const [finished, setFinished] = useState(false);
  const [error, setError] = useState('');
  const submitting = useRef(false);

  useEffect(() => {
    let active = true;
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (active) setReady(isRecoverySession(session));
    });
    supabase.auth.getSession().then(({ data, error: sessionError }) => {
      if (!active) return;
      setReady(!sessionError && isRecoverySession(data.session));
      setChecking(false);
    }).catch(() => {
      if (active) { setReady(false); setChecking(false); }
    });
    return () => { active = false; subscription.unsubscribe(); };
  }, []);

  useEffect(() => {
    if (!finished) return;
    const timer = window.setTimeout(() => navigate('/admin/login', { replace: true }), 2000);
    return () => window.clearTimeout(timer);
  }, [finished, navigate]);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (submitting.current) return;
    setError('');
    if (!updated) {
      if (!newPassword || !confirmation) return setError('Both password fields are required.');
      if (newPassword.length < MIN_PASSWORD_LENGTH) return setError(`Password must contain at least ${MIN_PASSWORD_LENGTH} characters.`);
      if (newPassword !== confirmation) return setError('Passwords do not match.');
    }
    submitting.current = true;
    setLoading(true);
    try {
      if (!updated) {
        const { data, error: sessionError } = await supabase.auth.getSession();
        if (sessionError || !isRecoverySession(data.session)) {
          setReady(false);
          throw new Error(INVALID_LINK);
        }
        const { error: updateError } = await supabase.auth.updateUser({ password: newPassword });
        if (updateError) throw updateError;
        setUpdated(true);
        setNewPassword('');
        setConfirmation('');
      }
      const { error: signOutError } = await supabase.auth.signOut({ scope: 'local' });
      if (signOutError) throw new Error('Your password was updated, but sign out failed. Please retry signing out.');
      clearRecoverySession();
      setFinished(true);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Unable to update password. Please try again.');
    } finally {
      submitting.current = false;
      setLoading(false);
    }
  }

  return (
    <main className="admin-login">
      <div className="admin-login__photo" aria-hidden="true" />
      <div className="admin-login__scrim" aria-hidden="true" />
      <div className="admin-login__stack">
        <section className="admin-login__card" aria-labelledby="update-password-title">
          <span className="admin-login__brand"><img src="/images/papagayo-logo.png" alt="Papagayo Fishing Tours" /></span>
          <h1 id="update-password-title">Update Password</h1>
          <p className="admin-muted">Choose a new password for your account.</p>
          <span className="admin-login__rule" aria-hidden="true" />
          {updated ? <p role="status">Password updated successfully{finished ? '. Redirecting to login...' : '.'}</p> : null}
          {checking ? <p role="status">Checking recovery link...</p> : null}
          {!checking && !ready && !updated ? <p className="admin-alert admin-alert--danger" role="alert">{isSupabaseConfigured ? INVALID_LINK : 'Password recovery is unavailable. Please try again later.'}</p> : null}
          <form className="admin-login__form" onSubmit={handleSubmit} noValidate aria-busy={loading}>
            {!updated ? <>
              <label className="admin-login__field">
                <span className="admin-login__label">New Password</span>
                <input className="admin-input" type="password" autoComplete="new-password" required minLength={MIN_PASSWORD_LENGTH} value={newPassword} onChange={(event) => setNewPassword(event.target.value)} disabled={checking || !ready || loading} aria-describedby="password-requirements" />
              </label>
              <p id="password-requirements" className="admin-muted">Use at least {MIN_PASSWORD_LENGTH} characters.</p>
              <label className="admin-login__field">
                <span className="admin-login__label">Confirm New Password</span>
                <input className="admin-input" type="password" autoComplete="new-password" required minLength={MIN_PASSWORD_LENGTH} value={confirmation} onChange={(event) => setConfirmation(event.target.value)} disabled={checking || !ready || loading} />
              </label>
            </> : null}
            {error ? <p className="admin-alert admin-alert--danger" role="alert">{error}</p> : null}
            {!finished ? <button className="admin-btn" type="submit" disabled={loading || checking || (!ready && !updated)}>{loading ? (updated ? 'Signing out...' : 'Updating password...') : updated ? 'Retry sign out' : 'Update Password'}</button> : null}
            {(!ready && !updated) || finished ? <Link className="admin-btn admin-btn--secondary" to="/admin/login">Back to login</Link> : null}
          </form>
        </section>
      </div>
    </main>
  );
}

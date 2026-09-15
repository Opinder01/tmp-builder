import { useAuth } from "../../lib/AuthContext.jsx";
import { enablePushReminders } from "../../lib/push.js";
import { useState } from "react";

export default function Profile() {
  const { profile, signOut } = useAuth();
  const [pushStatus, setPushStatus] = useState(
    typeof Notification !== "undefined" ? Notification.permission : "unsupported"
  );

  async function handleEnablePush() {
    try {
      await enablePushReminders();
      setPushStatus("granted");
    } catch (err) {
      alert(err.message);
    }
  }

  return (
    <div>
      <h1>My Profile</h1>

      <div className="dispatch-card">
        <p>
          <strong>{profile.full_name}</strong>
        </p>
        <p className="subtle">{profile.email}</p>
        {profile.phone && <p>{profile.phone}</p>}
        <p className="subtle" style={{ textTransform: "capitalize" }}>{profile.worker_type}</p>

        {profile.worker_type === "employee" && (
          <>
            {profile.job_title && (
              <p>
                <strong>Job title:</strong> {profile.job_title}
              </p>
            )}
            {profile.wage != null && (
              <p>
                <strong>Wage:</strong> ${profile.wage}/hour
              </p>
            )}
          </>
        )}
      </div>

      {pushStatus === "default" && (
        <button onClick={handleEnablePush}>Enable Reminders</button>
      )}
      {pushStatus === "granted" && <p className="subtle">Reminders enabled.</p>}

      <button onClick={signOut} style={{ marginTop: "1rem" }}>
        Sign out
      </button>
    </div>
  );
}

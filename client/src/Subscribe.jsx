import { useNavigate } from "react-router-dom";
import "./Subscribe.css";

// ---------- helpers ----------
function getAuthUser() {
  try {
    return JSON.parse(localStorage.getItem("loggedInUser"));
  } catch {
    return null;
  }
}

function setAuthUser(nextUser) {
  localStorage.setItem("loggedInUser", JSON.stringify(nextUser));
}

// ---------- component ----------
export default function Subscribe() {
  const nav = useNavigate();
  const user = getAuthUser();

  // 🔒 If already subscribed or on trial → go to dashboard
  if (
    user?.plan &&
    (user.subscriptionStatus === "trial" ||
      user.subscriptionStatus === "active")
  ) {
    nav("/dashboard", { replace: true });
    return null;
  }

  // 🔒 If not logged in (safety)
  if (!user) {
    return (
      <div style={{ padding: 24 }}>
        <h2>Please log in</h2>
        <p>You need an account before choosing a plan.</p>
      </div>
    );
  }

  // ---------- plans ----------
  const PLANS = [
    {
      id: "monthly",
      title: "Monthly",
      price: 69.99,
      period: "month",
    },
    {
      id: "yearly",
      title: "Yearly",
      price: 699.99,
      period: "year",
      badge: "Save 20.2%",
    },
  ];

  const startTrial = (plan) => {
    const trialEndsAt = new Date(
      Date.now() + 7 * 24 * 60 * 60 * 1000
    ).toISOString();

    const updatedUser = {
      ...user,
      plan: plan.id,
      planPrice: plan.price,
      subscriptionStatus: "trial",
      trialEndsAt,
    };

    setAuthUser(updatedUser);
    nav("/dashboard");
  };

  // ---------- UI ----------
  return (
    <div className="subWrap">
      <div className="subInner">
        <div className="subHeader">
          <h1>Choose your plan</h1>
          <p>
            Start your <b>7-day free trial</b>. Cancel anytime.{" "}
            <b>Money-back guarantee:</b> 14 days after first payment.
          </p>
        </div>

        <div className="planGrid">
          {PLANS.map((plan) => (
            <div key={plan.id} className="card">
              <div className="cardTop">
                <h2 className="cardTitle">{plan.title}</h2>
                {plan.badge && (
                  <span className="badge">{plan.badge}</span>
                )}
              </div>

              <div className="priceRow">
                <div className="price">${plan.price}</div>
                <div className="per">/ {plan.period} (CAD)</div>
              </div>

              <ul className="list">
                <li>7-day free trial</li>
                <li>Full access during trial</li>
                <li>Money-back guarantee (14 days)</li>
              </ul>

              <button
                className="cta"
                onClick={() => startTrial(plan)}
              >
                Start free trial
              </button>
            </div>
          ))}
        </div>

        <div className="section">
          <h3>Need help?</h3>
          <p>
            Call us: <b>6729225617</b> or{" "}
            <a href="/contact">Contact Us</a>
          </p>
        </div>

        <div className="section faq">
          <h3>FAQ</h3>

          <details>
            <summary>How does the 7-day free trial work?</summary>
            <p>You get full access for 7 days.</p>
          </details>

          <details>
            <summary>When will I be charged?</summary>
            <p>After the trial ends.</p>
          </details>

          <details>
            <summary>Can I cancel anytime?</summary>
            <p>Yes, anytime.</p>
          </details>
        </div>
      </div>
    </div>
  );
}

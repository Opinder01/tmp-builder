import { useNavigate } from "react-router-dom";
import "./Legal.css";

export default function Privacy() {
  const nav = useNavigate();
  return (
    <div className="legal-root">
      <div className="legal-nav">
        <button className="legal-logo-btn" onClick={() => nav("/")}>
          <img src="/logo.png" alt="TMP Builder" className="legal-logo" />
        </button>
      </div>

      <div className="legal-body">
        <h1>Privacy Policy</h1>
        <p className="legal-date">Last updated: May 17, 2026</p>

        <p>TMP Builder ("we", "our", or "us") is committed to protecting your personal information. This Privacy Policy explains how we collect, use, and safeguard your data when you use our website and software at <a href="https://tmpbuilder.ca">tmpbuilder.ca</a>.</p>

        <h2>1. Information We Collect</h2>
        <ul>
          <li><strong>Account information:</strong> Name, email address, company name, and phone number provided during signup.</li>
          <li><strong>Billing information:</strong> Payment is processed securely by Stripe. We do not store your credit card details.</li>
          <li><strong>Usage data:</strong> Information about how you use the editor (e.g., projects created, features used) to improve the product.</li>
          <li><strong>Contact form submissions:</strong> Name, email, and message content when you contact us.</li>
        </ul>

        <h2>2. How We Use Your Information</h2>
        <ul>
          <li>To provide and maintain your account and subscription.</li>
          <li>To process payments and send billing-related communications.</li>
          <li>To respond to your support requests and contact form messages.</li>
          <li>To send important product updates and service announcements.</li>
          <li>To improve and develop our software features.</li>
        </ul>

        <h2>3. Data Sharing</h2>
        <p>We do not sell or rent your personal information. We share data only with trusted third-party service providers necessary to operate our service:</p>
        <ul>
          <li><strong>Stripe</strong> — payment processing</li>
          <li><strong>Vercel</strong> — hosting and infrastructure</li>
          <li><strong>Resend</strong> — transactional email delivery</li>
          <li><strong>Google Maps API</strong> — map and aerial imagery</li>
        </ul>

        <h2>4. Data Retention</h2>
        <p>We retain your account data for as long as your account is active. If you cancel your subscription and request account deletion, we will remove your personal data within 30 days, except where required by law.</p>

        <h2>5. Security</h2>
        <p>We use industry-standard security measures including HTTPS encryption, secure authentication, and access controls to protect your data.</p>

        <h2>6. Your Rights</h2>
        <p>You have the right to access, correct, or delete your personal information at any time. To make a request, contact us at <a href="mailto:info@tmpbuilder.ca">info@tmpbuilder.ca</a>.</p>

        <h2>7. Cookies</h2>
        <p>We use only essential cookies required for authentication and session management. We do not use advertising or tracking cookies.</p>

        <h2>8. Contact</h2>
        <p>For any privacy-related questions, please contact us at <a href="mailto:info@tmpbuilder.ca">info@tmpbuilder.ca</a>.</p>
      </div>

      <div className="legal-footer">
        <button onClick={() => nav("/")}>← Back to Home</button>
        <span>© {new Date().getFullYear()} TMP Builder. All rights reserved.</span>
      </div>
    </div>
  );
}

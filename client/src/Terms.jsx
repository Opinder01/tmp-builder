import { useNavigate } from "react-router-dom";
import "./Legal.css";

export default function Terms() {
  const nav = useNavigate();
  return (
    <div className="legal-root">
      <div className="legal-nav">
        <button className="legal-logo-btn" onClick={() => nav("/")}>
          <img src="/logo.png" alt="TMP Builder" className="legal-logo" />
        </button>
      </div>

      <div className="legal-body">
        <h1>Terms of Service</h1>
        <p className="legal-date">Last updated: May 17, 2026</p>

        <p>Please read these Terms of Service ("Terms") carefully before using TMP Builder at <a href="https://tmpbuilder.ca">tmpbuilder.ca</a>. By creating an account or using our service, you agree to be bound by these Terms.</p>

        <h2>1. Service Description</h2>
        <p>TMP Builder is a browser-based software-as-a-service (SaaS) platform for creating, editing, and exporting Traffic Management Plans (TMPs). The service is operated by TMP Builder, based in Victoria, BC, Canada.</p>

        <h2>2. Account Registration</h2>
        <ul>
          <li>You must provide accurate and complete information when creating an account.</li>
          <li>You are responsible for maintaining the security of your account credentials.</li>
          <li>You must be at least 18 years old to use this service.</li>
          <li>One account per person or organization unless otherwise agreed in writing.</li>
        </ul>

        <h2>3. Subscription & Billing</h2>
        <ul>
          <li><strong>Free Trial:</strong> A 7-day free trial is available with full access to all features. A valid payment method is required to start the trial.</li>
          <li><strong>Billing:</strong> After the trial period, your selected plan (Monthly at $69.99 CAD/mo or Annual at $699.99 CAD/yr) will be charged automatically.</li>
          <li><strong>Money-Back Guarantee:</strong> If you are not satisfied within 14 days of your first payment, contact us for a full refund.</li>
          <li><strong>Cancellation:</strong> You may cancel your subscription at any time from your account dashboard. Your access continues until the end of the current billing period.</li>
          <li><strong>Price Changes:</strong> We will provide at least 30 days' notice before changing subscription prices.</li>
        </ul>

        <h2>4. Acceptable Use</h2>
        <p>You agree not to:</p>
        <ul>
          <li>Use the service for any unlawful purpose or in violation of any regulations.</li>
          <li>Share your account credentials with others.</li>
          <li>Attempt to reverse-engineer, copy, or redistribute the software.</li>
          <li>Use automated tools to scrape or abuse the service.</li>
          <li>Submit false, misleading, or fraudulent information in any TMP created using this platform.</li>
        </ul>

        <h2>5. Intellectual Property</h2>
        <p>TMP Builder and its content, features, and functionality are owned by us and protected by applicable intellectual property laws. You retain ownership of the TMP documents and data you create using the service.</p>

        <h2>6. Disclaimer of Warranties</h2>
        <p>The service is provided "as is" without warranties of any kind. While we strive to maintain accuracy in the sign catalog and tools, TMP Builder does not guarantee that plans created using our software will be accepted or approved by any regulatory authority. Users are responsible for verifying compliance with applicable standards.</p>

        <h2>7. Limitation of Liability</h2>
        <p>To the fullest extent permitted by law, TMP Builder shall not be liable for any indirect, incidental, or consequential damages arising from your use of the service. Our maximum liability is limited to the amount you paid in the 12 months preceding the claim.</p>

        <h2>8. Termination</h2>
        <p>We reserve the right to suspend or terminate accounts that violate these Terms. You may terminate your account at any time by cancelling your subscription and contacting us.</p>

        <h2>9. Governing Law</h2>
        <p>These Terms are governed by the laws of the Province of British Columbia and the federal laws of Canada applicable therein.</p>

        <h2>10. Contact</h2>
        <p>For any questions about these Terms, please contact us at <a href="mailto:info@tmpbuilder.ca">info@tmpbuilder.ca</a>.</p>
      </div>

      <div className="legal-footer">
        <button onClick={() => nav("/")}>← Back to Home</button>
        <span>© {new Date().getFullYear()} TMP Builder. All rights reserved.</span>
      </div>
    </div>
  );
}

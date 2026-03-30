import { useState } from "react";

const SUPPORT_EMAIL = "opinders167@gmail.com"; // you will change later
const SUPPORT_PHONE = "6729225617";

export default function Contact() {
  const [form, setForm] = useState({
    firstName: "",
    lastName: "",
    company: "",
    email: "",
    phone: "",
    message: "",
  });

  const onChange = (e) => {
    setForm((p) => ({ ...p, [e.target.name]: e.target.value }));
  };

  // OPTION A: mailto fallback (always works, but opens email app)
  const submitViaMailto = (e) => {
    e.preventDefault();
    const subject = encodeURIComponent("TMP Builder Inquiry");
    const body = encodeURIComponent(
      `First Name: ${form.firstName}\n` +
      `Last Name: ${form.lastName}\n` +
      `Company: ${form.company}\n` +
      `Email: ${form.email}\n` +
      `Phone: ${form.phone}\n\n` +
      `Message:\n${form.message}\n`
    );

    window.location.href = `mailto:${SUPPORT_EMAIL}?subject=${subject}&body=${body}`;
  };

  return (
    <div style={{ maxWidth: 720, margin: "0 auto", padding: 24 }}>
      <h1>Contact Us</h1>
      <p>
        Phone: <b>{SUPPORT_PHONE}</b>
      </p>

      <form onSubmit={submitViaMailto} style={{ display: "grid", gap: 12 }}>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          <input name="firstName" placeholder="First Name" value={form.firstName} onChange={onChange} required />
          <input name="lastName" placeholder="Last Name" value={form.lastName} onChange={onChange} required />
        </div>

        <input name="company" placeholder="Company Name" value={form.company} onChange={onChange} />
        <input name="email" type="email" placeholder="Email Address" value={form.email} onChange={onChange} required />
        <input name="phone" placeholder="Phone Number" value={form.phone} onChange={onChange} required />

        <textarea
          name="message"
          placeholder="Please leave your message"
          value={form.message}
          onChange={onChange}
          rows={6}
          required
        />

        <button type="submit" style={{ padding: 12, borderRadius: 10, border: "none" }}>
          Send Inquiry
        </button>

        <p style={{ fontSize: 12, opacity: 0.8 }}>
          By submitting, you agree we may contact you back about your request.
        </p>
      </form>
    </div>
  );
}

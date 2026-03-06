use lettre::message::{header::ContentType, Mailbox, MultiPart, SinglePart};
use lettre::transport::smtp::authentication::Credentials;
use lettre::{AsyncSmtpTransport, AsyncTransport, Message, Tokio1Executor};
use std::env;

pub struct EmailConfig {
    pub smtp_host: String,
    pub smtp_port: u16,
    pub smtp_user: String,
    pub smtp_password: String,
    pub smtp_from: String,
}

impl EmailConfig {
    pub fn from_env() -> Option<Self> {
        let host = env::var("SMTP_HOST").ok().filter(|s| !s.is_empty())?;
        let user = env::var("SMTP_USER").ok().filter(|s| !s.is_empty())?;
        let password = env::var("SMTP_PASSWORD").ok().filter(|s| !s.is_empty())?;
        let port = env::var("SMTP_PORT")
            .ok()
            .and_then(|s| s.parse().ok())
            .unwrap_or(587);
        let from = env::var("SMTP_FROM")
            .ok()
            .filter(|s| !s.is_empty())
            .unwrap_or_else(|| "noreply@veridion-nexus.eu".to_string());

        Some(Self {
            smtp_host: host,
            smtp_port: port,
            smtp_user: user,
            smtp_password: password,
            smtp_from: from,
        })
    }
}

pub async fn send_welcome_email(
    config: &EmailConfig,
    to_email: &str,
    company_name: &str,
    api_key_raw: &str,
    trial_expires_at: &str,
) -> Result<(), String> {
    let from: Mailbox = config
        .smtp_from
        .parse()
        .map_err(|e| format!("Invalid from address: {}", e))?;

    let to: Mailbox = to_email
        .parse()
        .map_err(|e| format!("Invalid to address: {}", e))?;

    let plain_body = format!(
        "Welcome to Sovereign Shield, {company_name}!\n\
         \n\
         Your API key (save this — it won't be shown again):\n\
         {api_key_raw}\n\
         \n\
         Trial expires: {trial_expires_at}\n\
         \n\
         Quick start:\n\
           curl -X POST https://api.veridion-nexus.eu/api/v1/shield/evaluate \\\n\
             -H 'Authorization: Bearer {api_key_raw}' \\\n\
             -H 'Content-Type: application/json' \\\n\
             -d '{{\"destination_country\":\"US\",\"data_categories\":[\"email\"]}}'\n\
         \n\
         Dashboard: https://app.veridion-nexus.eu\n\
         Documentation: https://docs.veridion-nexus.eu\n\
         \n\
         Questions? Reply to this email.\n\
         \n\
         — Veridion Team"
    );

    let html_body = format!(
        "<div style=\"font-family: Inter, Arial, sans-serif; color: #e2e8f0; background: #0f172a; padding: 32px; border-radius: 12px;\">\
         <h1 style=\"color: #10b981; margin-top: 0;\">Welcome to Sovereign Shield</h1>\
         <p>Hi <strong>{company_name}</strong>,</p>\
         <p>Your API key <em>(save this — it won't be shown again)</em>:</p>\
         <div style=\"background: #1e293b; border: 1px solid #334155; border-radius: 8px; padding: 16px; margin: 16px 0;\">\
           <code style=\"font-family: 'JetBrains Mono', monospace; font-size: 14px; color: #10b981; word-break: break-all;\">{api_key_raw}</code>\
         </div>\
         <p>Trial expires: <strong>{trial_expires_at}</strong></p>\
         <h3 style=\"color: #94a3b8;\">Quick start</h3>\
         <pre style=\"background: #1e293b; border: 1px solid #334155; border-radius: 8px; padding: 16px; overflow-x: auto; font-size: 13px; color: #e2e8f0;\">\
curl -X POST https://api.veridion-nexus.eu/api/v1/shield/evaluate \\\n\
  -H 'Authorization: Bearer {api_key_raw}' \\\n\
  -H 'Content-Type: application/json' \\\n\
  -d '{{\"destination_country\":\"US\",\"data_categories\":[\"email\"]}}'\
         </pre>\
         <p>\
           <a href=\"https://app.veridion-nexus.eu\" style=\"color: #10b981;\">Dashboard</a> · \
           <a href=\"https://docs.veridion-nexus.eu\" style=\"color: #10b981;\">Documentation</a>\
         </p>\
         <hr style=\"border: none; border-top: 1px solid #334155; margin: 24px 0;\" />\
         <p style=\"color: #64748b; font-size: 13px;\">Questions? Reply to this email.<br/>— Veridion Team</p>\
         </div>"
    );

    let message = Message::builder()
        .from(from)
        .to(to)
        .subject("Your Sovereign Shield API key")
        .multipart(
            MultiPart::alternative()
                .singlepart(
                    SinglePart::builder()
                        .header(ContentType::TEXT_PLAIN)
                        .body(plain_body),
                )
                .singlepart(
                    SinglePart::builder()
                        .header(ContentType::TEXT_HTML)
                        .body(html_body),
                ),
        )
        .map_err(|e| format!("Failed to build email: {}", e))?;

    let creds = Credentials::new(config.smtp_user.clone(), config.smtp_password.clone());

    let mailer = AsyncSmtpTransport::<Tokio1Executor>::starttls_relay(&config.smtp_host)
        .map_err(|e| format!("SMTP relay error: {}", e))?
        .port(config.smtp_port)
        .credentials(creds)
        .build();

    mailer
        .send(message)
        .await
        .map_err(|e| format!("Failed to send email: {}", e))?;

    Ok(())
}

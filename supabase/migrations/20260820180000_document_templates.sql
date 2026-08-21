-- ============================================================
-- Migration: 20260820180000_document_templates.sql
-- document_templates table + seed master offer template
-- ============================================================

CREATE TABLE IF NOT EXISTS document_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  template_type TEXT NOT NULL DEFAULT 'offer' CHECK (template_type IN ('offer', 'contract', 'follow_up')),
  customer_type TEXT NOT NULL DEFAULT 'B2C' CHECK (customer_type IN ('B2C', 'B2B')),
  html_content TEXT NOT NULL,
  logo_url TEXT,
  is_default BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE document_templates ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS dt_auth_all ON document_templates;
CREATE POLICY dt_auth_all ON document_templates FOR ALL USING (auth.role() = 'authenticated');
DROP POLICY IF EXISTS dt_service ON document_templates;
CREATE POLICY dt_service ON document_templates FOR ALL USING (auth.role() = 'service_role');
DROP POLICY IF EXISTS dt_anon_select ON document_templates;
CREATE POLICY dt_anon_select ON document_templates FOR SELECT USING (true);

-- Seed B2C offer template
INSERT INTO document_templates (name, template_type, customer_type, html_content, is_default) VALUES
('Προσφορά Ηλεκτροδότησης B2C', 'offer', 'B2C',
'<!DOCTYPE html>
<html lang="el">
<head>
<meta charset="UTF-8">
<style>
  body { font-family: Arial, Helvetica, sans-serif; line-height: 1.6; color: #1f2937; margin: 0; padding: 20px; }
  .header { display: flex; justify-content: space-between; align-items: center; border-bottom: 3px solid #0ea5e9; padding-bottom: 20px; margin-bottom: 30px; }
  .logo { max-width: 180px; height: auto; }
  .company-info { text-align: right; font-size: 12px; color: #6b7280; }
  h1 { color: #0ea5e9; font-size: 22px; margin-bottom: 8px; }
  h2 { color: #1e293b; font-size: 16px; margin-bottom: 16px; }
  .tariff-table { width: 100%; border-collapse: collapse; margin: 20px 0; }
  .tariff-table th, .tariff-table td { border: 1px solid #e5e7eb; padding: 12px 16px; text-align: left; font-size: 14px; }
  .tariff-table th { background-color: #f0f9ff; color: #0369a1; font-weight: 600; width: 40%; }
  .tariff-table td { color: #1f2937; }
  .highlight { background: linear-gradient(135deg, #ecfdf5, #f0fdf4); padding: 16px; border-radius: 8px; border: 1px solid #bbf7d0; margin: 20px 0; }
  .highlight strong { color: #059669; }
  .savings { font-size: 24px; font-weight: 700; color: #059669; }
  .footer { margin-top: 40px; padding-top: 20px; border-top: 1px solid #e5e7eb; font-size: 12px; color: #9ca3af; text-align: center; }
  .legal { font-size: 10px; color: #9ca3af; margin-top: 20px; }
</style>
</head>
<body>
  <div class="header">
    <img src="{{logo_url}}" class="logo" alt="Hlektrismos.gr" />
    <div class="company-info">
      <strong>Hlektrismos.gr</strong><br>
      Αθηνάς 123, 10435 Αθήνα<br>
      210 123 4567 | info@hlektrismos.gr<br>
      www.hlektrismos.gr
    </div>
  </div>

  <h1>Προσφορά Ηλεκτροδότησης</h1>
  <p>Αγαπητέ/ή <strong>{{customer_name}}</strong>,</p>
  <p>με βάση την κατανάλωσή σας (<strong>{{monthly_kwh}} kWh/μήνα</strong>), σας προτείνουμε το παρακάτω πρόγραμμα:</p>

  <table class="tariff-table">
    <tr><th>Πάροχος</th><td>{{provider_name}}</td></tr>
    <tr><th>Πρόγραμμα</th><td>{{tariff_name}}</td></tr>
    <tr><th>Τιμή / kWh (Ημέρα)</th><td>{{price_kwh}} €</td></tr>
    <tr><th>Τιμή / kWh (Νύχτα)</th><td>{{price_night}} €</td></tr>
    <tr><th>Μηνιαίο Πάγιο</th><td>{{monthly_fixed_fee}} €</td></tr>
    <tr><th>Έκπτωση</th><td>{{discount_conditions}} €</td></tr>
    <tr><th>Εκτιμώμενο Μηνιαίο Κόστος</th><td><strong>{{monthly_estimate}} €</strong></td></tr>
    <tr><th>Εκτιμώμενο Ετήσιο Κόστος</th><td><strong>{{yearly_estimate}} €</strong></td></tr>
  </table>

  {{#if savings_amount}}
  <div class="highlight">
    <p>Το τρέχον πρόγραμμά σας ({{current_provider}}) κοστίζει περίπου <strong>{{current_monthly_cost}} €/μήνα</strong>.</p>
    <p>Με το νέο πρόγραμμα θα εξοικονομείτε:</p>
    <div class="savings">€{{savings_amount}} / μήνα (€{{savings_yearly}} / χρόνο)</div>
  </div>
  {{/if}}

  <p>Θα χαρούμε να σας βοηθήσουμε να ολοκληρώσετε την αλλαγή παρόχου. Επικοινωνήστε μαζί μας:</p>
  <p>📞 210 123 4567 | 📧 info@hlektrismos.gr</p>

  <div class="footer">
    <p>Με εκτίμηση,<br><strong>Η Ομάδα Hlektrismos.gr</strong></p>
    <p class="legal">Αυτή η προσφορά είναι ενδεικτική και ισχύει για νέους πελάτες. Οι τιμές μπορεί να διαφέρουν ανάλογα με την ακριβή κατανάλωση και τις συνθήκες σύμβασης.</p>
  </div>
</body>
</html>', true);

-- Seed B2B offer template
INSERT INTO document_templates (name, template_type, customer_type, html_content, is_default) VALUES
('Προσφορά Ηλεκτροδότησης B2B', 'offer', 'B2B',
'<!DOCTYPE html>
<html lang="el">
<head>
<meta charset="UTF-8">
<style>
  body { font-family: Arial, Helvetica, sans-serif; line-height: 1.6; color: #1f2937; margin: 0; padding: 20px; }
  .header { display: flex; justify-content: space-between; align-items: center; border-bottom: 3px solid #0ea5e9; padding-bottom: 20px; margin-bottom: 30px; }
  .logo { max-width: 180px; height: auto; }
  .company-info { text-align: right; font-size: 12px; color: #6b7280; }
  h1 { color: #0ea5e9; font-size: 22px; margin-bottom: 8px; }
  .tariff-table { width: 100%; border-collapse: collapse; margin: 20px 0; }
  .tariff-table th, .tariff-table td { border: 1px solid #e5e7eb; padding: 12px 16px; text-align: left; font-size: 14px; }
  .tariff-table th { background-color: #f0f9ff; color: #0369a1; font-weight: 600; width: 40%; }
  .highlight { background: linear-gradient(135deg, #ecfdf5, #f0fdf4); padding: 16px; border-radius: 8px; border: 1px solid #bbf7d0; margin: 20px 0; }
  .savings { font-size: 24px; font-weight: 700; color: #059669; }
  .footer { margin-top: 40px; padding-top: 20px; border-top: 1px solid #e5e7eb; font-size: 12px; color: #9ca3af; text-align: center; }
  .legal { font-size: 10px; color: #9ca3af; margin-top: 20px; }
</style>
</head>
<body>
  <div class="header">
    <img src="{{logo_url}}" class="logo" alt="Hlektrismos.gr" />
    <div class="company-info">
      <strong>Hlektrismos.gr</strong><br>
      Αθηνάς 123, 10435 Αθήνα<br>
      210 123 4567 | info@hlektrismos.gr
    </div>
  </div>

  <h1>Επαγγελματική Προσφορά Ηλεκτροδότησης</h1>
  <p>Αξιότιμε κύριε/κυρία,</p>
  <p>Η εταιρεία σας <strong>{{company_name}}</strong> με κατανάλωση <strong>{{monthly_kwh}} kWh/μήνα</strong> μπορεί να εξοικονομήσει σημαντικά:</p>

  <table class="tariff-table">
    <tr><th>Πάροχος</th><td>{{provider_name}}</td></tr>
    <tr><th>Πρόγραμμα</th><td>{{tariff_name}}</td></tr>
    <tr><th>Τιμή / kWh (Ημέρα)</th><td>{{price_kwh}} €</td></tr>
    <tr><th>Τιμή / kWh (Νύχτα)</th><td>{{price_night}} €</td></tr>
    <tr><th>Μηνιαίο Πάγιο</th><td>{{monthly_fixed_fee}} €</td></tr>
    <tr><th>Έκπτωση</th><td>{{discount_conditions}}</td></tr>
    <tr><th>Εκτιμώμενο Μηνιαίο Κόστος</th><td><strong>{{monthly_estimate}} €</strong></td></tr>
    <tr><th>Εκτιμώμενο Ετήσιο Κόστος</th><td><strong>{{yearly_estimate}} €</strong></td></tr>
  </table>

  {{#if savings_amount}}
  <div class="highlight">
    <p>Το τρέχον κόστος: <strong>{{current_monthly_cost}} €/μήνα</strong> ({{current_provider}})</p>
    <p>Ετήσια εξοικονόμηση:</p>
    <div class="savings">€{{savings_yearly}} / χρόνο</div>
  </div>
  {{/if}}

  <p>Για οριστικοποίηση ή ερωτήσεις, επικοινωνήστε με τον εμπορικό μας αντιπρόσωπο.</p>

  <div class="footer">
    <p>Με εκτίμηση,<br><strong>Η Ομάδα Hlektrismos.gr</strong></p>
    <p class="legal">Αυτή η προσφορά είναι ενδεικτική. Οι τιμές υπόκεινται σε επιβεβαίωση με βάση την ακριβή κατανάλωση και τις επίσημες τιμές του παρόχου.</p>
  </div>
</body>
</html>', true);

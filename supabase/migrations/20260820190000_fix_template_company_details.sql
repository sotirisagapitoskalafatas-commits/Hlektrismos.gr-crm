-- Fix company details in seeded document_templates
UPDATE document_templates
SET html_content = REPLACE(REPLACE(html_content,
  'Αθηνάς 123, 10435 Αθήνα', 'Μαύρη Πέτρα 27, 10435 Αθήνα'),
  '210 123 4567', '210 9750816')
WHERE html_content LIKE '%Αθηνάς 123%';

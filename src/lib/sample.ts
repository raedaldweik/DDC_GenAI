// Sample payload mirroring exactly what SAS VA posts to the DDC object,
// using David Taylor's real rows from TRF_DANGEROUS_JOIN_V4. Used for
// standalone testing (?demo=1 or the "show example" button) so the app can be
// demoed and styled without a live VA report.
export const SAMPLE_MESSAGE = {
  resultName: 'dd91',
  rowCount: 3,
  availableRowCount: 3,
  columns: [
    { name: 'bi100', label: 'الاسم', type: 'string' },
    { name: 'bi101', label: 'درجة خطورة السائق', type: 'string' },
    { name: 'bi102', label: 'نسبة الخطورة', type: 'number' },
    { name: 'bi103', label: 'الجنسية', type: 'string' },
    { name: 'bi104', label: 'الوظيفة', type: 'string' },
    { name: 'bi105', label: 'نص المخالفة', type: 'string' },
    { name: 'bi106', label: 'TICKET_NO', type: 'string' },
    { name: 'bi107', label: 'TOTAL_FINE', type: 'number' },
    { name: 'bi108', label: 'TICKET_DATE', type: 'date' },
    { name: 'bi109', label: 'LAST_TICKET_DATE', type: 'date' },
    { name: 'bi110', label: 'الحي', type: 'string' },
    { name: 'bi111', label: 'عدد المركبات', type: 'number' },
    { name: 'bi112', label: 'المركبات المنتهية', type: 'number' },
    { name: 'bi113', label: 'السوابق الجنائية', type: 'number' },
  ],
  data: [
    ['ديفيد تايلور', 'متوسط', 0.2974, 'المملكة المتحدة', 'بحار', 'عدم ربط حزام الأمان', '9001837', 400, '23JUL2026', '23JUL2026', 'واحة السيليكون', 7, 4, 0],
    ['ديفيد تايلور', 'متوسط', 0.2974, 'المملكة المتحدة', 'بحار', 'عدم ربط حزام الأمان', '9001838', 525, '17JUL2023', '23JUL2026', 'رأس الخور', 7, 4, 0],
    ['ديفيد تايلور', 'متوسط', 0.2974, 'المملكة المتحدة', 'بحار', 'استخدام الهاتف المتحرك أثناء القيادة', '9001839', 800, '06AUG2025', '23JUL2026', 'الجداف', 7, 4, 0],
  ],
}

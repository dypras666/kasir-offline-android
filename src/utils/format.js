export const formatNumber = (amount) => {
  const val = Number(amount) || 0;
  return val.toLocaleString('id-ID');
};

export const formatRp = (amount) => {
  return 'Rp ' + formatNumber(amount);
};

export const formatDate = (date) => {
  if (!date) return '';
  const d = new Date(date);
  return d.toLocaleString('id-ID');
};

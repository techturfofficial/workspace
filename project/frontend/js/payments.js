(function () {
  if (window.__techTurfPaymentsDashboardLoader) return;
  window.__techTurfPaymentsDashboardLoader = true;

  const script = document.createElement('script');
  script.src = '/js/payments.js?v=dashboard-20260622';
  script.defer = true;
  document.head.appendChild(script);
})();

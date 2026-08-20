const PAGE_SIZE = 10;

function paginate(rows, page) {
  const p = Math.max(1, parseInt(page, 10) || 1);
  const total = rows.length;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const currentPage = Math.min(p, totalPages);
  const start = (currentPage - 1) * PAGE_SIZE;
  const data = rows.slice(start, start + PAGE_SIZE);
  return { data, total, page: currentPage, totalPages, pageSize: PAGE_SIZE };
}

module.exports = { paginate, PAGE_SIZE };

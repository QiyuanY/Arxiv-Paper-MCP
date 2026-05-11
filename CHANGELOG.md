# Changelog

## [1.1.0] - 2026-05-11

### Added
- 搜索功能支持精确短语匹配（多词查询自动添加双引号）
- arXiv API 请求限流重试逻辑（429 错误自动重试 3 次）

### Fixed
- 修复 `getArxivPdfUrl` 处理 PDF URL 时重复添加 .pdf 后缀的问题
- 修复 `totalResults` 解析失败的问题（使用正确的命名空间标签名）
- 修复 `get_recent_papers` 错误提取摘要的问题（arXiv 最近论文页面不含摘要）
- 修复搜索结果摘要截断逻辑，避免短摘要被错误添加 "..."
- 修复精确短语搜索不生效的问题

### Changed
- `get_recent_papers` 工具新增 `maxResults` 参数，支持自定义返回论文数量

## [1.0.2] - 2026-05-10

### Fixed
- 初始版本发布后的紧急 bug 修复

## [1.0.0] - 2026-05-10

### Added
- 首次发布
- 支持搜索 arXiv 论文（search_arxiv）
- 支持获取最新论文列表（get_recent_papers）
- 支持获取论文 PDF 链接（get_pdf_url）
- 支持读取和解析论文内容（read_paper）

import express from 'express';
import path from 'path';
import { existsSync } from 'fs';
import { wpDb } from './server/mysql';
import { wpCache } from './server/cache';

const PORT = Number(process.env.PORT || 3001);
const DIST_DIR = path.resolve(process.cwd(), 'dist');
const app = express();

app.disable('x-powered-by');
app.use(express.json({ limit: '1mb' }));

app.get('/wp-json/wp/v2/posts', (req, res) => {
  const category = typeof req.query.category === 'string' ? req.query.category : 'all';
  const search = typeof req.query.search === 'string' ? req.query.search : '';
  res.json(wpDb.getPublishedPosts(category === 'all' ? undefined : category, search || undefined));
});

app.get('/wp-json/wp/v2/categories', (_req, res) => {
  res.json(wpDb.getCategories());
});

app.get('/wp-json/wp/v2/tags', (_req, res) => {
  res.json(wpDb.getTags());
});

app.get('/wp-json/wp/v2/cache/metrics', (_req, res) => {
  res.json(wpCache.getMetrics());
});

app.post('/wp-json/wp/v2/cache/purge', (_req, res) => {
  const result = wpCache.purgeAll();
  res.json({ success: true, result });
});

app.get('/wp-json/wp/v2/comments', (req, res) => {
  const postIdParam = req.query.post;
  const postId = typeof postIdParam === 'string' ? Number(postIdParam) : undefined;
  if (postId && Number.isNaN(postId)) {
    return res.status(400).json({ message: 'Invalid post id.' });
  }
  return res.json(wpDb.getComments(postId));
});

app.post('/wp-json/wp/v2/comments', (req, res) => {
  const { postId, authorName, authorEmail, content } = req.body || {};
  if (!postId || !authorName || !content) {
    return res.status(400).json({ message: 'postId, authorName and content are required.' });
  }
  const comment = wpDb.addComment(Number(postId), String(authorName), String(authorEmail || 'guest@example.com'), String(content));
  return res.status(201).json(comment);
});

app.post('/wp-json/wp/v2/posts', (req, res) => {
  const { title, content, excerpt, authorId = 1, categoryIds = [1], tagIds = [], featuredImage, readTimeMinutes } = req.body || {};

  if (!title || !content) {
    return res.status(400).json({ message: 'title and content are required.' });
  }

  const post = wpDb.createPost({
    title: String(title),
    content: String(content),
    excerpt: excerpt ? String(excerpt) : undefined,
    authorId: Number(authorId),
    categoryIds: Array.isArray(categoryIds) ? categoryIds.map(Number) : [Number(categoryIds)],
    tagIds: Array.isArray(tagIds) ? tagIds.map(Number) : [],
    featuredImage: featuredImage ? String(featuredImage) : undefined,
    readTimeMinutes: readTimeMinutes ? Number(readTimeMinutes) : 5,
  });

  return res.status(201).json(post);
});

app.post('/wp-json/wp/v2/mysql/query', (req, res) => {
  const sql = typeof req.body?.sql === 'string' ? req.body.sql : '';
  if (!sql) {
    return res.status(400).json({ message: 'SQL query is required.' });
  }
  return res.json(wpDb.executeSql(sql));
});

app.get('/wp-json/wp/v2/mysql/logs', (_req, res) => {
  res.json(wpDb.queryLogs);
});

app.post('/wp-json/wp/v2/performance/benchmark', (req, res) => {
  const requests = Number(req.body?.requests || 1000);
  const concurrency = Number(req.body?.concurrency || 50);
  const result = wpCache.runTrafficBenchmark(requests, concurrency);
  res.json(result);
});

app.get('/health', (_req, res) => {
  res.json({ status: 'ok', app: 'WordPress news blog demo', port: PORT });
});

if (existsSync(path.join(DIST_DIR, 'index.html'))) {
  app.use(express.static(DIST_DIR));
  app.get('*', (_req, res) => {
    res.sendFile(path.join(DIST_DIR, 'index.html'));
  });
} else {
  app.get('*', (_req, res) => {
    res.status(503).json({
      message: 'Frontend bundle not built yet. Run npm run build or npm run dev after installing dependencies.',
    });
  });
}

app.listen(PORT, '0.0.0.0', () => {
  console.log(`[WordPress news blog] API + app server ready on http://0.0.0.0:${PORT}`);
  console.log('[WordPress news blog] PHP backend removed; Node WordPress-style mock API is active.');
});

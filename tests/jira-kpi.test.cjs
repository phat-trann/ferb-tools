const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');
const ts = require('typescript');

const sourcePath = path.join(__dirname, '../src/features/jira-worklog/content.ts');
const script = ts.transpileModule(fs.readFileSync(sourcePath, 'utf8'), {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None },
}).outputText;

async function runKpi(completedIssues, month = '2026-10', cutoffDate = '2026-10-31') {
  let listener;
  const queries = [];
  const origin = 'https://jira.example.com';
  const context = {
    window: { location: { origin } },
    chrome: {
      runtime: {
        id: 'test-extension',
        onMessage: { addListener(value) { listener = value; } },
      },
    },
    URL,
    URLSearchParams,
    console,
    fetch: async (url) => {
      const request = new URL(url);
      let body;
      if (request.pathname === '/rest/api/3/myself') {
        body = { accountId: 'me', displayName: 'Test user' };
      } else if (request.pathname === '/rest/api/3/search/jql') {
        const jql = request.searchParams.get('jql');
        queries.push({ jql, fields: request.searchParams.get('fields') });
        body = { issues: jql.includes('cf[10091]') ? completedIssues : [], isLast: true };
      } else {
        throw new Error(`Unexpected request: ${url}`);
      }
      return {
        ok: true,
        headers: { get: (name) => name === 'content-type' ? 'application/json' : null },
        json: async () => body,
      };
    },
  };
  vm.runInNewContext(script, context);
  const response = await new Promise((resolve) => {
    assert.equal(listener({
      type: 'RUN_JIRA_WORKLOG_SYNC_V3',
      settings: { siteUrl: origin, attendanceUrl: 'https://attendance.example.com', month, concurrency: 3, role: 'DEV' },
      cutoffDate,
    }, { id: 'test-extension' }, resolve), true);
  });
  assert.equal(response.success, true, response.error);
  return { result: response.result, queries };
}

test('On Deadline uses Completed Date even when Resolved would reverse the result', async () => {
  const { result, queries } = await runKpi([
    {
      key: 'TEST-LATE',
      fields: {
        duedate: '2026-10-29',
        customfield_10091: '2026-10-30T00:15:00.000+0700',
        resolutiondate: '2026-10-28T10:00:00.000+0700',
      },
    },
    {
      key: 'TE20-13174',
      fields: { duedate: '2026-10-30', customfield_10091: '2026-10-30T19:11:34.548+0700' },
    },
    { key: 'TEST-NO-COMPLETED', fields: { duedate: '2026-10-30', resolutiondate: '2026-10-30T10:00:00.000+0700' } },
    { key: 'TEST-NO-DUE', fields: { customfield_10091: '2026-10-30T10:00:00.000+0700' } },
  ]);
  assert.equal(result.completedWithDueDate, 2);
  assert.equal(result.completedOnTime, 1);
  const query = queries.find(({ jql }) => jql.includes('cf[10091]'));
  assert.equal(query.jql, 'assignee = currentUser() AND cf[10091] >= "2026-10-01" AND cf[10091] < "2026-11-01"');
  assert.equal(query.fields, 'key,duedate,customfield_10091');
});

test('Completed Date cutoff includes the whole selected day, including year rollover', async () => {
  for (const [month, cutoff, end] of [
    ['2026-10', '2026-10-15', '2026-10-16'],
    ['2026-12', '2026-12-31', '2027-01-01'],
  ]) {
    const { queries } = await runKpi([], month, cutoff);
    const { jql } = queries.find(({ jql }) => jql.includes('cf[10091]'));
    assert.ok(jql.endsWith(`cf[10091] < "${end}"`));
  }
});

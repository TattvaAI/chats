/* eslint-disable @typescript-eslint/no-require-imports */
require('../scripts/register-ts.cjs');
const {test}=require('node:test');const assert=require('node:assert/strict');
const {parseWhatsAppChat}=require('../lib/parser/whatsapp.ts');
const {computeChatMetrics}=require('../lib/forensics/metrics.ts');
const {computeDetailedStats,synthesizeDetailedStats}=require('../lib/forensics/detailed-stats.ts');
const {detectTurningPoint}=require('../lib/forensics/turning-point.ts');
const {readJson}=require('../lib/requests.ts');
const {equalSecret}=require('../lib/auth/access.ts');
const {buildFullTranscript}=require('../lib/ai/analyzer.ts');
test('a file uses one US date convention and rejects rolled dates',()=>{
 const r=parseWhatsAppChat('6/13/26, 10:00 - Alex: first\n7/1/26, 10:01 - Jo: next\n2/31/26, 10:02 - Alex: invalid');
 assert.equal(r.messages.length,2);assert.equal(r.messages[1].timestamp.toISOString(),'2026-07-01T10:01:00.000Z');
});
test('bracketed ISO dates preserve seconds and tapbacks never become original messages',()=>{
 const r=parseWhatsAppChat('[2026-01-02 14:23:45] Alex: Hello\n[2026-01-02 14:24:00] Jo: Loved “Hello”');
 assert.equal(r.messages[0].sender,'Alex');assert.equal(r.messages[0].timestamp.getUTCSeconds(),45);
 assert.equal(r.messages[1].content,'Loved “Hello”');assert.equal(r.messages[1].isReaction,true);assert.equal(computeChatMetrics(r.messages).totalMessages,1);
});
test('median includes simultaneous replies and excludes a new session',()=>{
 const r=parseWhatsAppChat('01/01/26, 10:00 - A: hi\n01/01/26, 10:01 - B: hi\n01/01/26, 10:02 - A: yes\n01/01/26, 10:05 - B: yes\n03/01/26, 10:05 - B: new session');
 const s=computeChatMetrics(r.messages);assert.equal(s.participants.find(p=>p.name==='B').medianResponseTimeMinutes,2);assert.equal(s.participants.find(p=>p.name==='B').doubleTextCount,0);assert.equal(s.activeDays,2);
 const simultaneous=parseWhatsAppChat('01/01/26, 10:00 - A: hi\n01/01/26, 10:00 - B: hi\n01/01/26, 10:01 - A: yes\n01/01/26, 10:03 - B: yes');
 assert.equal(computeChatMetrics(simultaneous.messages).participants[1].medianResponseTimeMinutes,1);
});
test('no observed replies stay null while actual simultaneous replies stay zero', () => {
 const separated=parseWhatsAppChat('01/01/26, 10:00 - Alex: A new plan\n01/01/26, 15:00 - Jo: A later conversation\n02/01/26, 10:00 - Alex: Another new plan\n02/01/26, 16:00 - Jo: Another later conversation');
 const missing=computeChatMetrics(separated.messages);
 assert.deepEqual(missing.participants.map(person=>person.medianResponseTimeMinutes),[null,null]);
 assert.deepEqual(computeDetailedStats(separated.messages,missing).perPerson.map(person=>person.medianReplyMin),[null,null]);

 const simultaneous=parseWhatsAppChat('01/01/26, 10:00 - Alex: A new plan\n01/01/26, 10:00 - Jo: Yes to that plan\n02/01/26, 10:00 - Alex: Another new plan\n02/01/26, 10:00 - Jo: Yes to this one');
 const observed=computeChatMetrics(simultaneous.messages);
 assert.equal(observed.participants.find(person=>person.name==='Alex').medianResponseTimeMinutes,null);
 assert.equal(observed.participants.find(person=>person.name==='Jo').medianResponseTimeMinutes,0);
 const detailed=computeDetailedStats(simultaneous.messages,observed);
 assert.equal(detailed.perPerson.find(person=>person.name==='Alex').medianReplyMin,null);
 assert.equal(detailed.perPerson.find(person=>person.name==='Jo').medianReplyMin,0);
});
test('charts contain only observed events including after-midnight hours',()=>{
 const r=parseWhatsAppChat('01/01/26, 23:00 - A: hello\n02/01/26, 01:00 - B: hello');const s=computeChatMetrics(r.messages),d=computeDetailedStats(r.messages,s);
 assert.equal(d.after10pmPct,100);assert.equal(d.calendar.reduce((a,b)=>a+b.count,0),2);assert.equal(synthesizeDetailedStats(s).calendar.length,0);
});
test('descending data is safe and growth does not become a decline',()=>{
 const messages=[];for(let w=0;w<5;w++)for(let i=0;i<20+w*10;i++)messages.push({id:`${w}-${i}`,sender:'A',content:'hello',isSystem:false,timestamp:new Date(Date.UTC(2026,0,1+w*7,0,i))});
 assert.equal(detectTurningPoint(messages.reverse()),null);
});
test('long accepted chats retain every source message without sampling',async()=>{
 const m=Array.from({length:5000},(_,i)=>({sender:i%2?'B':'A',content:`unique-source-${i}`,at:'2026-01-01T00:00:00Z'}));
 const text=await buildFullTranscript('friend',m);for(const message of m)assert.ok(text.includes(message.content));
});
test('oversized bodies are stopped while streaming and secrets compare safely',async()=>{
 const req=new Request('http://local',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({text:'x'.repeat(200)})});await assert.rejects(readJson(req,20),{status:413});
 assert.equal(equalSecret('abcd','éééé'),false);assert.equal(equalSecret('abc','abc'),true);
});

test('multiline source messages preserve indentation and blank lines while empty placeholders stay excluded', () => {
 const parsed=parseWhatsAppChat('01/01/26, 10:00 - Alex: first line  \n\n  indented line\t \n01/01/26, 10:01 - Jo:   \n01/01/26, 10:02 - Alex: \n  text after blank start\n01/01/26, 10:03 - Jo: hello\n');
 assert.equal(parsed.messages[0].content,'first line  \n\n  indented line\t ');
 assert.equal(parsed.messages[1].isSystem,true);
 assert.equal(parsed.messages[2].content,'\n  text after blank start');
 assert.equal(parsed.messages[2].isSystem,false);
 assert.equal(parsed.totalMessages,3);assert.equal(computeChatMetrics(parsed.messages).totalMessages,3);
});

test('calendar duration counts both UTC dates across a midnight boundary', () => {
 const parsed=parseWhatsAppChat('[2026-01-01 23:59:00] Alex: hi\n[2026-01-02 00:01:00] Jo: hello');
 const stats=computeChatMetrics(parsed.messages);
 assert.equal(stats.dateRange.durationDays,2);assert.equal(stats.activeDays,2);
 assert.deepEqual(computeDetailedStats(parsed.messages,stats).calendar.map(day=>day.date),['2026-01-01','2026-01-02']);
});

test('participant names that match object prototype keys remain ordinary data', () => {
 const parsed=parseWhatsAppChat('01/01/26, 10:00 - __proto__: orchid orchid\n01/01/26, 10:01 - constructor: hello there\n01/01/26, 10:02 - toString: coffee time');
 const stats=computeChatMetrics(parsed.messages);
 assert.deepEqual(stats.participants.map(person=>person.name),['__proto__','constructor','toString']);
 assert.deepEqual(stats.participants.map(person=>person.messageCount),[1,1,1]);
 assert.equal(stats.participants[0].wordCount,2);assert.equal({}.count,undefined);
});

test('deleted placeholders count as deletions without becoming favourite words', () => {
 const parsed=parseWhatsAppChat('01/01/26, 10:00 - Alex: This message was deleted\n01/01/26, 10:01 - Alex: You deleted this message\n01/01/26, 10:02 - Alex: orchid orchid');
 const stats=computeChatMetrics(parsed.messages), detailed=computeDetailedStats(parsed.messages,stats);
 assert.equal(stats.totalDeleted,2);assert.equal(stats.participants[0].wordCount,2);
 assert.deepEqual(detailed.perPerson[0].topWords,[{word:'orchid',count:2}]);
});

test('turning-point labels stay in UTC and extreme spans are bounded', () => {
 const messages=[];
 for(let week=0;week<5;week++)for(let index=0;index<(week===0?100:10);index++)messages.push({id:`${week}-${index}`,sender:'__proto__',content:'A synthetic source message',isSystem:false,timestamp:new Date(Date.UTC(2026,0,1+week*7,0,index))});
 const originalZone=process.env.TZ;
 try {
  process.env.TZ='America/Los_Angeles';
  const result=detectTurningPoint(messages);
  assert.equal(result.turningDate.toISOString(),'2026-01-08T00:00:00.000Z');
  assert.equal(result.turningWeekLabel,'Jan 8 - Jan 14, 2026');
 } finally {if(originalZone===undefined)delete process.env.TZ;else process.env.TZ=originalZone;}
 const extreme=Array.from({length:50},(_,index)=>({id:String(index),sender:'Alex',content:'A synthetic source message',isSystem:false,timestamp:new Date(Date.UTC(index<25?1900:2099,0,1,0,index))}));
 assert.equal(detectTurningPoint(extreme),null);
});

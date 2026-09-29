const test=require('node:test');
const assert=require('node:assert/strict');
const middleware=require('../middleware/disabledChatbot');
test('chatbot entry points are disabled while business history remains accessible',()=>{
 for(const path of ['/api/bot/notifications','/api/bot/requests','/api/management/requests','/api/management/requests/1','/api/history/123/refund-request']){
  let status,payload;middleware({path},{status(code){status=code;return this;},json(data){payload=data;}},()=>assert.fail('Disabled route reached application'));
  assert.equal(status,410);assert.equal(payload.code,'CHATBOT_DISABLED');
 }
 for(const path of ['/api/history','/api/history/123/evidence','/api/checkout','/api/employees','/api/shifts']){let passed=false;middleware({path},{},()=>{passed=true;});assert.equal(passed,true);}
});

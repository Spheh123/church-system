const {authorize,handler}=require('./lib/server');
const guides=require('./lib/training-manuals.json');
exports.handler=handler(async event=>{
 const {profile}=await authorize(event);
 const allowed=profile.role==='team'?['team']:['admin','pastors','team','ushers'];
 return {guides:allowed.map(id=>({id,...guides[id]}))};
});

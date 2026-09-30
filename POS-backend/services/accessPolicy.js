const roles=['employee','manager','owner','admin'];
const management=role=>['manager','owner','admin'].includes(role);
const salaryEligible=role=>['employee','manager'].includes(role);
function canManage(actor,target){return actor==='admin'||(actor==='owner'&&['employee','manager'].includes(target))||(actor==='manager'&&target==='employee');}
function allowedNewRoles(actor){return actor==='admin'?['employee','manager','owner','admin']:actor==='owner'?['employee','manager']:['employee'];}
function assertChange(actor,target,next,creating=false){
 if(!roles.includes(actor)||!roles.includes(next))throw Object.assign(Error('Invalid access level.'),{status:400});
 if(!creating&&!canManage(actor,target))throw Object.assign(Error('You cannot change this account.'),{status:403});
 if((creating||target!==next)&&!allowedNewRoles(actor).includes(next))throw Object.assign(Error(next==='manager'?'Only an Owner or Admin can create or promote a Manager.':'You cannot assign this access level.'),{status:403});
}
module.exports={roles,management,salaryEligible,canManage,allowedNewRoles,assertChange};

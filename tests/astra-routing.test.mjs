import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {resolveLaunchPlan, validateExecutionReceipt, verifyExecutionReceipt, validateModelRouting} from '../scripts/host-capabilities.mjs';
const read = f => JSON.parse(fs.readFileSync(new URL(f, import.meta.url),'utf8'));
const packet={objective:'Analyze an independent architecture seam',independent:true,ordered:false,mutation_scope:'read-only',shared_mutable_state:false,evidence_advantage:'independent source analysis',work_kind:'architecture',compute_class:'frontier',escalation_class:null,task_risk:'medium',budget:{max_workers:1,max_rounds:1},output_schema:'findings'};
for(const effort of ['medium','ultra']) test(`Astra ${effort} survives routing and receipt attestation`,()=>{
 const caps=read('./fixtures/skills-kernel/codex-runtime-observed.json');
 Object.assign(caps,{model:'gpt-6-astra',reasoning_effort:effort,observed_at:new Date().toISOString()});
 const routing=read('../adapters/codex.models.json');
 const result=resolveLaunchPlan({capabilities:caps,packet,routing});
 assert.equal(result.allowed,true);
 assert.equal(result.launch_plan.reasoning_effort,effort);
 const receipt={schema_version:1,launch_id:result.launch_plan.launch_id,harness:'codex',actual_model:'gpt-6-astra',actual_reasoning_effort:effort,source:'session-metadata',observed_at:new Date().toISOString(),adapter:'native-test',runtime_version:'fixture',thread_id:'fixture-thread',attestation_basis:'runtime-metadata'};
 assert.equal(validateExecutionReceipt(receipt),receipt);
 assert.equal(verifyExecutionReceipt({launchPlan:result.launch_plan,receipt}).verified,true);
 for(const schema of ['host-capabilities','model-routing','launch-plan','execution-receipt']){
  const s=read(`../protocol/schemas/${schema}.schema.json`);
  const field=s.properties?.reasoning_effort??s.properties?.actual_reasoning_effort??s.$defs?.profile?.properties.reasoning_effort;
  assert.ok(field, `${schema} has an effort field`); assert.ok(field.enum.includes(effort));
 }
});
test('concrete ultra routing still requires the exact observed model/effort pair',()=>{
 const caps=read('./fixtures/skills-kernel/codex-runtime-observed.json');
 Object.assign(caps,{model:'gpt-6-astra',reasoning_effort:'medium',model_override:true,effort_override:true,available_models:['gpt-6-astra'],available_reasoning_efforts:['medium','ultra'],available_model_effort_pairs:[{model:'gpt-6-astra',reasoning_effort:'medium'}]});
 const routing=read('../adapters/codex.models.json');
 routing.profiles.frontier={model:'gpt-6-astra',reasoning_effort:'ultra',selection_mode:'per-invocation'};
 validateModelRouting(routing);
 assert.ok(resolveLaunchPlan({capabilities:caps,packet,routing}).reasons.includes('model_effort_pair_unavailable'));
 caps.available_model_effort_pairs.push({model:'gpt-6-astra',reasoning_effort:'ultra'});
 assert.equal(resolveLaunchPlan({capabilities:caps,packet,routing}).allowed,true);
});

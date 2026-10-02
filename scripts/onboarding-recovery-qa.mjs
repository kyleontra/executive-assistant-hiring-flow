import { onboardingStage, pendingPhotoReview } from '/supabase/functions/_shared/onboarding-state.mjs';
import { parsePortfolioLinks } from '/supabase/functions/_shared/portfolio-links.mjs';
if (!['localhost','127.0.0.1'].includes(location.hostname)) throw Error('Local QA only');
const params = new URLSearchParams(location.search), key = 'hfsa-onboarding-recovery-qa';
const initial = () => ({profile:{user_id:'local-qa',full_name:'QA Candidate',verification_status:'draft',onboarding_preferences_required:true},progress:{},preferences:{},confirmed:false,failures:{},history:[]});
let saved = JSON.parse(sessionStorage.getItem(key) || 'null') || initial();
if(params.has('reset')) saved = initial();
const persist = () => sessionStorage.setItem(key,JSON.stringify(saved));
persist();
if (params.get('camera') === 'denied') navigator.mediaDevices.getUserMedia = async () => { throw new DOMException('Simulated blocked camera. You can upload a video instead.', 'NotAllowedError'); };
window.__onboardingQaErrors=[];
window.addEventListener('error', event => window.__onboardingQaErrors.push(event.message));
window.addEventListener('unhandledrejection', event => window.__onboardingQaErrors.push(String(event.reason)));
const originalFetch = window.fetch.bind(window);
window.qaNavigate = url => { const page = new URL(url,location.origin+'/').pathname.split('/').at(-1).replace('.html',''); location.assign('/scripts/onboarding-recovery-qa.html?page='+page); };
const user = () => ({id:'local-qa',email:'qa@example.invalid',app_metadata:{account_role:'candidate'}});
window.getVerifiedCandidate=async()=>saved.confirmed ? user() : null;
window.getVerifiedUser=window.getVerifiedCandidate;
window.getAccessToken=async()=>'local-qa-only';
window.savaAuth={auth:{onAuthStateChange(){},verifyOtp:async()=>{saved.confirmed=true;persist();return {error:null}},resend:async()=>({error:null}),signOut:async()=>({error:null})}};
window.masterSessionToken=()=>null;
const profile = () => ({name:'QA Candidate',fullName:'QA Candidate',resumePath:saved.profile.resume_path,photoPath:saved.profile.profile_photo_path,photoUrl:location.origin+'/assets/hire-from-sa-logo.jpeg',resumeFileName:'QA resume.txt',resumeRequired:!saved.profile.resume_path,verificationStatus:saved.profile.verification_status,applicationReady:onboardingStage(saved.profile,saved.progress)==='complete',summary:'QA candidate account',skills:['Administration'],tools:['Excel'],experience:[]});
window.savaPlatform={candidateRequest:async action=>{if(saved.failures.account){saved.failures.account--;persist();throw Error('Simulated account lookup failure. Retry loading account.')}return action==='candidateDashboard'?{profile:profile(),applications:[],conversations:[]}:{profile:profile()}},publicRequest:async()=>({jobs:[]})};
function status(){return {stage:onboardingStage(saved.profile,saved.progress),reviewReference:pendingPhotoReview(saved.profile,saved.progress),approved:saved.profile.verification_status==='verified',introSaved:!!saved.progress.intro_path,introUrl:saved.progress.intro_path?location.origin+'/outputs/onboarding-recovery-20260930/test-recording.mp4':'',surveyStep:saved.profile.career_survey_completed_at?2:1,preferences:saved.preferences,contractName:'QA Candidate'};}
window.fetch=async(url, options={})=>{
 if(!String(url).includes('supabase.co')) return originalFetch(url, options);
 const endpoint=String(url).split('/').at(-1), multipart=options.body instanceof FormData;
 const body=multipart?options.body:JSON.parse(options.body), action=multipart?endpoint:body.action;
 saved.history.push(action);
 if(saved.failures[action]){saved.failures[action]--;persist();return Response.json({error:'Simulated service failure. Please retry.'},{status:503})}
 const now = new Date().toISOString();
 if(endpoint==='register-candidate'){persist();return Response.json({status:'created'},{status:201})}
 if(endpoint==='submit-resume'){saved.profile.resume_path='local-qa/resume.txt';persist();return Response.json({path:saved.profile.resume_path},{status:201})}
 if(endpoint==='submit-profile-photo'){saved.profile.profile_photo_path='candidate-profiles/local-qa/profile.jpg';persist();return Response.json({path:saved.profile.profile_photo_path},{status:201})}
 if(endpoint==='submit-id-photos'){Object.assign(saved.progress,{review_reference:'SA-ABCDEF12',identity_photos_uploaded_at:now});persist();return Response.json({reference:saved.progress.review_reference},{status:201})}
 if(endpoint==='submit-id-video'){saved.progress.identity_video_uploaded_at=now;persist();return Response.json({status:'contract_required'},{status:202})}
 if(endpoint!=='candidate-onboarding') throw Error('Live writes blocked');
 if(action==='status')return Response.json(status());
 if(action==='completeGuide')saved.progress[body.guide+'_completed_at']=now;
 else if(action==='completeContract'){saved.progress.contract_accepted_at=now;saved.profile.verification_status='pending';}
 else if(action==='saveCareerSurvey'){Object.assign(saved.preferences,body);saved.profile.career_survey_completed_at=now;}
 else if(action==='savePreferences'){
   try{body.portfolioLinks=parsePortfolioLinks(body.portfolioLinks)}catch(error){return Response.json({error:error.message},{status:400})}
   Object.assign(saved.preferences,body);saved.profile.preferences_completed_at=now;
 } else if(action==='skipIntro')saved.progress.intro_skipped_at=now;
 else if(action==='submit-id-video'||action==='saveIntro'||endpoint==='candidate-onboarding'&&multipart){saved.progress.intro_path='local-qa/intro.mp4';saved.progress.intro_skipped_at=null;}
 else if(action==='removeIntro'){saved.progress.intro_path=null;saved.progress.intro_skipped_at=now;}
 else throw Error('QA action unavailable: '+action);
 persist();return Response.json({status:'saved',...status()});
};
const page=params.get('page')||'candidate-signup';
const allowed=['candidate-signup','check-email','email-confirmed','candidate-resume','candidate-profile','candidate-next-steps','id-verification','verification','candidate-onboarding','candidate-dashboard'];
if(!allowed.includes(page)) throw Error('QA page unavailable');
const template=new DOMParser().parseFromString(await(await originalFetch('/'+page+'.html')).text(),'text/html');
template.querySelectorAll('script').forEach(node=>node.remove());
const base=document.createElement('base');base.href=location.origin+'/';document.head.prepend(base);
for(const link of template.head.querySelectorAll('link')) document.head.append(link.cloneNode(true));
document.body.className=template.body.className;document.body.replaceChildren(...[...template.body.childNodes].map(node=>node.cloneNode(true)));
const qa=document.createElement('aside');qa.style.cssText='padding:8px 14px;background:#fff8d9;font:12px system-ui;border-bottom:1px solid #ddd;position:relative;z-index:2;display:flex;gap:12px;flex-wrap:wrap';
qa.innerHTML='<strong>LOCAL QA · No live accounts or uploads</strong><button id="failAccount">Fail next account load</button><select id="failAction"><option value="submit-resume">Resume upload</option><option value="submit-profile-photo">Headshot upload</option><option value="submit-id-photos">ID photos</option><option value="submit-id-video">Private video</option><option value="completeGuide">Guide save</option><option value="saveCareerSurvey">Job form</option><option value="savePreferences">Goals form</option><option value="candidate-onboarding">Intro upload</option><option value="skipIntro">Skip intro</option></select><button id="failNext">Fail next request</button><button id="failThree">Fail next three requests</button><button id="approveQa">Simulate identity approval</button><a href="/scripts/onboarding-recovery-qa.html?reset=1">Restart QA</a>';
document.body.prepend(qa);
qa.querySelector('#failAccount').onclick=()=>{saved.failures.account=1;persist();location.reload()};
qa.querySelector('#failNext').onclick=()=>{saved.failures[qa.querySelector('#failAction').value]=1;persist()};
qa.querySelector('#failThree').onclick=()=>{saved.failures[qa.querySelector('#failAction').value]=3;persist()};
qa.querySelector('#approveQa').onclick=()=>{saved.profile.verification_status='verified';persist()};
document.addEventListener('click', event=>{const link=event.target.closest('a');if(link?.getAttribute('href')?.startsWith('./')&&!link.target){event.preventDefault();window.qaNavigate(link.href)}});
if(page!=='check-email'){
 const js=page+(page==='candidate-onboarding'?'.mjs':'.js');
 let source=await(await originalFetch('/'+js)).text();
 source=source.replace(/(?:window\.)?location\.(?:assign|replace)\(/g,'window.qaNavigate(').replace(/from (['"])(\.\/|\/)([^'"]+)\1/g,(_m,q,_p,path)=>`from ${q}${location.origin}/${path}${q}`);
 const moduleUrl=URL.createObjectURL(new Blob([source],{type:'text/javascript'}));await import(moduleUrl);URL.revokeObjectURL(moduleUrl);
}

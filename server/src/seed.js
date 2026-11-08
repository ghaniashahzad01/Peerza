import 'dotenv/config';
import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
import { User, UserSkill } from './models.js';

const demoPassword = process.env.DEMO_PASSWORD || 'PeerzaDemo2025!';
const demoUsers = [
  { name:'Maya Chen', email:'maya@peerza.demo', location:'Brooklyn, NY', bio:'Product designer who loves making complex ideas feel simple. I can help with design systems and prototypes, and I am learning to build with React.', skills:[['Figma','Design','teach'],['UI design','Design','teach'],['React','Technology','learn'],['Creative coding','Technology','learn']] },
  { name:'Jordan Lee', email:'jordan@peerza.demo', location:'Queens, NY', bio:'Frontend developer building joyful things for the web. Happy to share React and JavaScript in exchange for design feedback.', skills:[['React','Technology','teach'],['JavaScript','Technology','teach'],['Figma','Design','learn'],['UI design','Design','learn']] },
  { name:'Amina Yusuf', email:'amina@peerza.demo', location:'Jersey City, NJ', bio:'Illustrator and storyteller. I love drawing characters and would like to learn photography and creative web design.', skills:[['Illustration','Art','teach'],['Procreate','Art','teach'],['Photography','Art','learn'],['React','Technology','learn']] },
  { name:'Leo Martinez', email:'leo@peerza.demo', location:'Manhattan, NY', bio:'Creative developer with a soft spot for thoughtful details. I can help with code and want to grow my visual design skills.', skills:[['React','Technology','teach'],['JavaScript','Technology','teach'],['Figma','Design','learn'],['Brand design','Design','learn']] },
  { name:'Sophie Williams', email:'sophie@peerza.demo', location:'Brooklyn, NY', bio:'Brand designer helping early ideas find their visual voice. I am learning to build my own portfolio with code.', skills:[['Figma','Design','teach'],['Brand design','Design','teach'],['Typography','Design','teach'],['JavaScript','Technology','learn']] },
  { name:'Noah Kim', email:'noah@peerza.demo', location:'Long Island City, NY', bio:'Photographer chasing good light and interesting places. I would love to trade camera tips for illustration lessons.', skills:[['Photography','Art','teach'],['Lightroom','Art','teach'],['Illustration','Art','learn'],['Design','Design','learn']] }
];

try {
  await mongoose.connect(process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/peerza');
  const password = await bcrypt.hash(demoPassword, 12);
  for (const item of demoUsers) {
    const user = await User.findOneAndUpdate({ email: item.email }, { $set: { name:item.name, email:item.email, password, bio:item.bio, location:item.location, isDemo:true } }, { upsert:true, new:true, runValidators:true, setDefaultsOnInsert:true });
    await UserSkill.deleteMany({ user:user.id });
    await UserSkill.insertMany(item.skills.map(([name,category,type])=>({user:user.id,name,category,type})));
  }
  console.log(`Seeded ${demoUsers.length} Peerza demo accounts. Login password: ${demoPassword}`);
  console.log('Run this demo seed only against a development database.');
} catch (error) {
  console.error('Could not seed Peerza demo data:', error.message);
  process.exitCode = 1;
} finally {
  await mongoose.disconnect();
}

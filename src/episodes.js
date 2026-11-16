// ===== Haunted-road episodes: each Thai legend plays out as a short story that builds up along the road =====
// Every episode is a little state machine driven by the car's progress (metres) and time. It places figures
// (h.ent), speaks through subtitles (h.say: narration / a voice), plays sounds and sets up the scare at the end.
// The player's choices matter: stop for the woman waving by the road or drive past her; look round or don't.
import { ROAD_HALF } from './world.js';

const rnd = (a, b) => a + Math.random() * (b - a);

export const EPISODES = {
  // ----- Krasue: a floating woman's head trailing her glowing insides, hunting at night -----
  krasue: {
    title: 'กระสือ',
    epilogue: 'กระสือคือผีผู้หญิงที่ถอดหัวออกจากร่างตอนกลางคืน ลากตับไตไส้พุงที่เรืองแสงสีเขียวลอยหากิน... คนโบราณว่าอย่าตากผ้าทิ้งไว้นอกบ้าน มันจะเอามาเช็ดปาก',
    update(h, ep, st, dt) {
      const e = ep.e, side = ep.side;
      if (ep.beat === 0) {
        e.k = h.ent('krasue', ep.s0 + 420, side * 60, 2.4); e.k.want = 1;
        h.audio.howl?.(); h.later(1.5, () => h.say('หมาทั้งหมู่บ้านเห่าหอนขึ้นมาพร้อมกัน...', 'narr'));
        ep.beat = 1;
      } else if (ep.beat === 1) {
        const d = e.k.s - st.carS;
        e.k.s = Math.max(e.k.s, st.carS + 60);
        if (d < 260) e.k.L += (side * 13 - e.k.L) * Math.min(1, dt * 0.25);
        e.k.y = 2.4 + Math.sin(ep.t * 1.3) * 0.5;
        if (d < 240 && !e.saw) { e.saw = 1; h.say('แสงสีเขียววูบวาบลอยอยู่กลางทุ่ง... แล้วค่อยๆ ลอยเข้าหาถนน', 'narr'); }
        if (Math.abs(e.k.L) < 14.5 && d < 90) { ep.beat = 2; h.audio.ghostCall?.('krasue'); }
      } else if (ep.beat === 2) {                                      // crosses the road ahead
        e.k.s = Math.max(e.k.s, st.carS + 35); e.k.L -= side * 9 * dt; e.k.y = 2 + Math.sin(ep.t * 2) * 0.3;
        if (Math.abs(e.k.L) > 16) { e.k.want = 0; ep.beat = 3; ep.t = 0; h.later(5, () => h.say('ข้างทางเงียบไปแล้ว... แต่หมายังหอนไม่หยุด', 'narr')); h.later(4, () => h.audio.howl?.()); }
      } else if (ep.beat === 3) {                                      // ...and then it is at your window
        if (ep.t > 9 && !e.side) {
          e.side = 1; e.k.fade = 0; e.k.want = 1; e.k.follow = true; h.audio.sting?.(0.55);
          h.later(5, () => h.say('(เสียงหัวเราะคิกคักแผ่วๆ ข้างหู)', 'narr')); h.later(5, () => h.audio.whisper?.());
        }
        if (e.k.follow) {
          e.k.s = st.carS + 1.0 + Math.sin(ep.t * 0.7) * 0.4; e.k.L = st.carL - 2.0; e.k.y = 0.8 + Math.sin(ep.t * 2.2) * 0.12;
          const looking = st.lookYaw < -0.9;
          if (looking && ep.t > 11) { h.kill(e.k); h.peri('window', 'krasue', 1, { lunge: true }); ep.beat = 4; ep.t = 0; }   // she comes through the window at you
          else if (ep.t > 20) { h.kill(e.k); h.peri('roof', 'krasue', 7); ep.beat = 4; ep.t = -5; }   // you lose sight of her... she is hanging over the top of the windscreen
        }
      } else if (ep.beat === 4) {
        if (ep.t > 3) h.endEpisode();
      }
    },
  },

  // ----- Pret: the starving giant of the temple grounds, as tall as a sugar palm, begging for merit -----
  pret: {
    title: 'เปรต',
    epilogue: 'เปรตคือสัตว์นรกตัวสูงเท่าต้นตาล ผอมจนเห็นซี่โครง ปากเท่ารูเข็มกินอะไรไม่ได้ จะออกมาส่งเสียงหวีดขอส่วนบุญในคืนเดือนมืด... ทำบุญแล้วอย่าลืมกรวดน้ำ',
    update(h, ep, st, dt) {
      const e = ep.e, side = ep.side;
      if (ep.beat === 0) {
        e.p = h.ent('pret', ep.s0 + 480, side * 30); h.prop('tree', ep.s0 + 120, -side); h.prop('shrine', ep.s0 + 300, side); h.prop('tree', ep.s0 + 470, side * 0.6);
        h.audio.bell?.(); h.later(2, () => h.say('เสียงระฆังวัดดังมาแต่ไกล... ทั้งที่เลยเที่ยงคืนไปนานแล้ว', 'narr'));
        h.later(8, () => h.audio.bell?.());
        ep.beat = 1;
      } else if (ep.beat === 1) {
        const d = e.p.s - st.carS;
        e.p.want = d < 320 && d > 100 ? 1 : 0;
        e.wh = (e.wh || 0) - dt; if (d < 360 && e.wh <= 0) { e.wh = rnd(3.5, 6); h.audio.ghostCall?.('pret'); }
        if (d < 300 && !e.saw) { e.saw = 1; h.say('เสียงหวีดแหลมเล็ก... ดังมาจากทางยอดตาล', 'narr'); }
        if (d < 100) {
          ep.beat = 2; ep.t = 0; h.kill(e.p); e.p = null;
          h.later(2, () => { h.say('"...หิว... ขอส่วนบุญด้วย..."', 'voice'); h.approach('pret', [95, 62, 36, 15], true); });
        }
      } else if (ep.beat === 2) {                                      // it comes closer every time the lights die
        if (ep.t > 3 && !h.scare && !e.back) {
          e.back = h.ent('pret', st.carS - 30, st.carL); e.back.scale = 1.5; e.back.fade = 1; e.back.want = 1;
          ep.beat = 3; ep.t = 0;
        }
      } else if (ep.beat === 3) {
        if (ep.t > 7 && e.back.want) e.back.want = 0;
        if (ep.t > 10) h.endEpisode();
      }
    },
  },

  // ----- Nang Tani: the spirit of the wild banana tree, weeping in the grove on moonlit nights -----
  tani: {
    title: 'ผีตานี',
    epilogue: 'นางตานีคือนางไม้ที่สิงอยู่ในต้นกล้วยตานี ชาวบ้านจะผูกผ้าสีไว้ที่ต้นและไม่มีใครกล้าตัด... เสียงผู้หญิงสะอื้นใต้ดงกล้วยในคืนเดือนหงาย คือเธอ',
    update(h, ep, st, dt) {
      const e = ep.e, side = ep.side;
      if (ep.beat === 0) {
        for (let k = 0; k < 16; k++) h.prop('banana', ep.s0 + 140 + k * 32 + rnd(-8, 8), (k % 2 ? 1 : -1) * rnd(1.2, 2.6));
        e.t = h.ent('tani', ep.s0 + 330, side * (ROAD_HALF + 5.5)); e.n = 0;
        h.later(1.5, () => h.say('สองข้างทางกลายเป็นดงกล้วยตานี... ต้นหนึ่งมีผ้าแพรสีผูกไว้', 'narr'));
        h.later(5, () => { h.audio.sob?.(); h.say('(เสียงผู้หญิงสะอื้นแผ่วๆ อยู่ในความมืด)', 'narr'); });
        ep.beat = 1;
      } else if (ep.beat === 1) {
        const d = e.t.s - st.carS; e.t.want = d < 150 && d > 12 ? 1 : 0;
        e.sb = (e.sb || 0) - dt; if (e.sb <= 0) { e.sb = rnd(6, 9); h.audio.sob?.(); }
        if (d < 110 && e.seenN !== e.n) { e.seenN = e.n; void 0; }
        if (d < 10) {
          e.n++;
          if (e.n < 2) { e.t.s = st.carS + rnd(170, 200); e.t.L = -e.t.L * 0.6; e.t.fade = 0; }
          else { h.kill(e.t); ep.beat = 2; ep.t = 0; h.later(2.5, () => { h.say('เครื่องยนต์สะดุด... ไฟหน้าดับวูบ', 'narr'); h.audio.sputter?.(); }); }
        }
      } else if (ep.beat === 2) {                                      // the car dies in the middle of the grove
        if (ep.t > 2.5 && ep.t < 5) { h.fx.lights = 0; h.fx.stall = 1; if (!e.sob2) { e.sob2 = 1; h.audio.sob?.(1); } }
        if (ep.t >= 5 && !e.go) { e.go = 1; h.say('"...ใครมาตัดต้นกล้วยของข้า..."', 'voice'); h.approach('tani', [32, 19, 10, 4.5], true); }
        if (e.go && !h.scare && ep.t > 8) { ep.beat = 3; ep.t = 0; }
      } else if (ep.beat === 3) {
        if (ep.t > 5) h.endEpisode();
      }
    },
  },

  // ----- Krahang: the man who flies at night on rice-winnowing trays, a pestle for a tail -----
  krahang: {
    title: 'กระหัง',
    epilogue: 'กระหังคือผีผู้ชายที่เล่นของ ใช้กระด้งสองใบต่างปีก สากตำข้าวสอดหว่างขาเป็นหาง บินหากินกลางดึก... ได้ยินเสียงกระพือปีกเหนือหลังคาเมื่อไหร่ อย่าเงยหน้ามอง',
    update(h, ep, st, dt) {
      const e = ep.e, side = ep.side;
      if (ep.beat === 0) {
        h.audio.flap?.(3); h.later(1, () => h.say('มีเสียงอะไรบางอย่างกระพือปีกอยู่เหนือหลังคารถ...', 'narr'));
        h.later(6, () => { h.audio.knock?.(); h.say('(ตึง!) ...มันเกาะอยู่บนหลังคา', 'narr'); h.heart = 1; });
        h.later(10, () => h.audio.scratch?.());
        h.later(14, () => { h.audio.flap?.(2.5); e.k = h.ent('krahang', st.carS + 70, side * 6, 6); e.k.want = 1; e.k.fade = 0.6; e.k.flyDir = side; ep.t = 0; h.say('มันโผบินขึ้นไปข้างหน้า... กระด้งสองใบกางเป็นปีก', 'narr'); });
        ep.beat = 1;
      } else if (ep.beat === 1) {
        if (e.k && !e.landed) {                                        // circles ahead... then drops onto the bonnet
          e.k.s = Math.max(e.k.s + dt * 6, st.carS + 45); e.k.L = st.carL + Math.sin(ep.t * 0.8) * 10; e.k.y = 6 + Math.sin(ep.t * 1.4) * 1.2;
          if (ep.t > 20) { e.landed = 1; e.lt = 0; h.audio.knock1?.(); h.audio.sting?.(1); h.fx.shake = 1; h.audio.flap?.(3); }
        } else if (e.k && e.landed) {
          e.lt += dt; e.k.s = st.carS + 3.1; e.k.L = st.carL; e.k.y = 0.75 + Math.sin(e.lt * 9) * 0.05; e.k.scale = 0.75; h.heart = 1; if (Math.random() < 0.05) h.fx.lights = 0.1;
          if (e.lt > 3.5) { e.k.y += (e.lt - 3.5) * 12; if (e.lt > 4.6) { h.kill(e.k); e.k = null; ep.beat = 2; ep.t = 0; h.audio.flap?.(1.5); } }
        }
      } else if (ep.beat === 2) {
        if (ep.t > 4) h.endEpisode();
      }
    },
  },
};

// ----- Yai Speed: the old woman who runs after cars on the highway at night, faster than any of them -----
EPISODES.yai = {
  title: 'ยายสปีด',
  epilogue: 'ตำนานผีถนนยุคใหม่ หญิงชราผมขาวที่ยืนรอรถอยู่ตามศาลาริมทางตอนดึก ใครไม่รับ ยายจะวิ่งตามรถไปได้เร็วไม่ว่าจะขับเร็วแค่ไหน... ใครเห็นยายวิ่งแซงหน้า ให้รีบหาที่จอดพักเสีย',
  update(h, ep, st, dt) {
    const e = ep.e, y = h.yai, kmh = Math.round(Math.abs(st.carV) * 3.6);
    const curb = Math.sign(st.carL) || 1;
    const backSeat = (after) => {                                        // she is in the car now
      ep.beat = 6; ep.t = 0; h.clearYai();
      h.later(after, () => { h.audio.door?.(); h.say('ไม่มีใครเปิดประตู... แต่ที่เบาะหลัง มีเสียงคนหายใจหอบ', 'narr'); h.audio.breath?.(); });
      h.later(after + 6, () => { h.audio.breath?.(); h.say('"เหนื่อย... วิ่งตามรถมาตั้งไกล"', 'voice'); e.armed = 1; });
    };
    if (ep.beat === 0) {
      e.sala = h.prop('sala', ep.s0 + 320, curb);
      h.spawnYai(st.carS, { s: e.sala.s + 1, L: curb * (ROAD_HALF + 1.2) });
      h.later(1, () => h.say('ตีสองแล้ว... ทั้งถนนไม่มีรถคันอื่นเลยสักคัน', 'narr'));
      ep.beat = 1;
    } else if (ep.beat === 1) {                                          // the old woman at the bus shelter
      const d = e.sala.s - st.carS;
      if (d < 32 && d > 0 && Math.abs(st.carV) < 1.5) {                // you stopped for her
        h.say('"หลาน... ไปทางเดียวกันไหม ยายขอติดรถไปด้วยคน"', 'voice'); h.later(2.5, () => h.flash = 0.2); backSeat(3);
      } else if (d < -3) {                                               // you drove on
        ep.beat = 2; ep.t = 0; e.taunt = 0;
        h.later(1.5, () => h.say('ในกระจกหลัง... ยายเดินออกมากลางถนน แล้วออกวิ่งตามรถมา', 'narr'));
        h.later(1.5, () => { if (h.yai) { h.yai.phase = 'catch'; h.yai.off = e.sala.s - st.carS; h.yai.paceDur = 8; } });
      }
    } else if (ep.beat === 2) {                                          // the chase
      if (y && y.phase === 'catch') {
        e.tt = (e.tt || 0) - dt;
        if (e.tt <= 0 && ep.t > 5 && e.taunt < 2 && kmh > 30) { e.tt = 5; e.taunt++; h.say(e.taunt === 1 ? `เข็มไมล์ ${kmh}... ยายยังวิ่งตามมาทัน` : `${kmh} กิโลแล้ว... ยายอยู่ข้างท้ายรถแล้ว`, 'narr'); }
      }
      if (y && y.phase === 'pace') {
        if (!e.pace) { e.pace = 1; e.pt = 0; h.audio.knock?.(); h.say('(ก๊อก ก๊อก ก๊อก) ...มีคนเคาะกระจกฝั่งคนขับ', 'narr'); h.later(2.5, () => h.say('"จะรีบไปไหนล่ะหลาน..."', 'voice')); }
        e.pt += dt;
        if (e.pt > 2 && st.lookYaw < -0.9) { h.clearYai(); h.peri('window', 'yai', 1, { lunge: true }); ep.beat = 5; ep.t = 0; }                 // you turned to look at her
        else if (e.pt > 6.5 && !e.slam) { e.slam = 1; h.peri('window', 'yai', 3); h.audio.knock1?.(); }
        else if (Math.abs(st.carV) < 1) { h.say('"...ยายเหนื่อยแล้ว ขอนั่งพักด้วยคนนะ"', 'voice'); backSeat(2); }
      }
      if (y && y.phase === 'pass' && !e.p) { e.p = 1; h.audio.ghostCall?.('yai'); }
      if (!y && e.p) { ep.beat = 3; ep.t = 0; }
    } else if (ep.beat === 3) {                                          // ...the same shelter again
      if (ep.t > 6 && !e.sala2) {
        e.sala2 = h.prop('sala', st.carS + 360, curb);
        h.spawnYai(st.carS, { s: e.sala2.s + 1, L: curb * (ROAD_HALF + 1.2) });
      }
      if (e.sala2) {
        const d = e.sala2.s - st.carS;
        if (d < 180 && !e.saw2) { e.saw2 = 1; h.say('ศาลารอรถหลังเดิม... ยายคนเดิม ยืนอยู่ที่เดิม', 'narr'); h.audio.sting?.(0.4); }
        if (d < 30) h.flickerLights();
        if (d < 0) {
          e.sala2.dead = true; h.clearYai(); h.flash = 0.3; h.audio.whisper?.();
          h.say('"ไม่ต้องหนีหรอกหลาน... ยายนั่งอยู่ข้างหลังนี่แล้ว"', 'voice');
          ep.beat = 4; ep.t = 0;
        }
      }
    } else if (ep.beat === 4) {
      if (!e.bh) { e.bh = h.peri('behind', 'yai', 30, { quiet: true }); } if (ep.t > 30 || (e.bh && !h.peris.includes(e.bh))) { ep.beat = 5; ep.t = 0; }
    } else if (ep.beat === 5) {
      if (ep.t > 4) h.endEpisode();
    } else if (ep.beat === 6) {                                          // riding with her behind you
      if (e.armed && !e.bh) e.bh = h.peri('behind', 'yai', 40, { quiet: true });
      if (e.bh && !h.peris.includes(e.bh)) { ep.beat = 5; ep.t = 0; }
      else if (e.armed && ep.t > 24) { h.say('"ขอบใจนะหลาน... ส่งยายแค่นี้แหละ"', 'voice'); h.audio.door?.(); ep.beat = 5; ep.t = 0; }
    }
  },
};

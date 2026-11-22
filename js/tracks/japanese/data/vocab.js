// Practical travel vocabulary. Format per line: kana | usual written form (kanji, '' if same) | English | theme
// Themes: greet, people, food, menu, drink, transport, direction, place, shop, color, hotel, time, day, count, adj, verb, health, ask
const RAW = `
はい||yes|greet
いいえ||no|greet
こんにちは||hello|greet
こんばんは||good evening|greet
ありがとう||thanks|greet
すみません||excuse me / sorry|greet
どうぞ||please (go ahead) / here you are|greet
わたし|私|I, me|people
あなた||you|people
ともだち|友達|friend|people
かぞく|家族|family|people
なまえ|名前|name|people
しごと|仕事|job, work|people
にほん|日本|Japan|people
インド||India|people
にほんご|日本語|Japanese (language)|people
えいご|英語|English (language)|people
ひと|人|person|people
せんせい|先生|teacher|people
がくせい|学生|student|people
エンジニア||engineer|people
かいしゃいん|会社員|office worker|people
こども|子供|child|people
みず|水|water|drink
おちゃ|お茶|green tea|drink
コーヒー||coffee|drink
こうちゃ|紅茶|black tea|drink
ビール||beer|drink
さけ|酒|sake, alcohol|drink
ジュース||juice|drink
ぎゅうにゅう|牛乳|milk|drink
ごはん|ご飯|rice, a meal|food
パン||bread|food
にく|肉|meat|food
とりにく|鶏肉|chicken|food
ぶたにく|豚肉|pork|food
ぎゅうにく|牛肉|beef|food
さかな|魚|fish|food
やさい|野菜|vegetables|food
たまご|卵|egg|food
すし|寿司|sushi|food
ラーメン||ramen|food
うどん||udon noodles|food
そば||soba noodles|food
カレー||curry|food
てんぷら|天ぷら|tempura|food
おにぎり||rice ball|food
べんとう|弁当|boxed lunch (bento)|food
みそしる|味噌汁|miso soup|food
くだもの|果物|fruit|food
りんご||apple|food
アイスクリーム||ice cream|food
メニュー||menu|food
はし|箸|chopsticks|food
スプーン||spoon|food
フォーク||fork|food
さとう|砂糖|sugar|food
しお|塩|salt|food
しょうゆ|醤油|soy sauce|food
ベジタリアン||vegetarian|food
おすすめ||recommendation|food
おかわり||refill, another helping|food
ちゅうもん|注文|order|food
かいけい|会計|the bill|food
あさごはん|朝ご飯|breakfast|food
ひるごはん|昼ご飯|lunch|food
ばんごはん|晩ご飯|dinner|food
カフェラテ||cafe latte|menu
ケーキ||cake|menu
チーズケーキ||cheesecake|menu
サンドイッチ||sandwich|menu
パスタ||pasta|menu
ピザ||pizza|menu
サラダ||salad|menu
スープ||soup|menu
オレンジジュース||orange juice|menu
アイスティー||iced tea|menu
ホットドッグ||hot dog|menu
ハンバーガー||hamburger|menu
フライドポテト||french fries|menu
チョコレート||chocolate|menu
ミルクティー||milk tea|menu
トースト||toast|menu
ソーダ||soda|menu
レモン||lemon|menu
パンケーキ||pancakes|menu
カレーライス||curry and rice|menu
えき|駅|station|transport
でんしゃ|電車|train|transport
ちかてつ|地下鉄|subway|transport
しんかんせん|新幹線|bullet train|transport
バス||bus|transport
タクシー||taxi|transport
ひこうき|飛行機|airplane|transport
くうこう|空港|airport|transport
きっぷ|切符|ticket|transport
ホーム||platform|transport
のりば|乗り場|boarding point|transport
かいさつ|改札|ticket gate|transport
でぐち|出口|exit|transport
いりぐち|入口|entrance|transport
のりかえ|乗り換え|transfer (change trains)|transport
していせき|指定席|reserved seat|transport
じゆうせき|自由席|unreserved seat|transport
おとな|大人|adult|transport
じゅうしょ|住所|address|transport
ちず|地図|map|direction
みち|道|road, way|direction
こうさてん|交差点|intersection|direction
しんごう|信号|traffic light|direction
かど|角|corner|direction
みぎ|右|right|direction
ひだり|左|left|direction
まっすぐ||straight ahead|direction
まえ|前|front, before|direction
うしろ|後ろ|behind|direction
となり|隣|next to|direction
ここ||here|direction
そこ||there (near you)|direction
あそこ||over there|direction
どこ||where|direction
うえ|上|up, on top|direction
した|下|down, below|direction
なか|中|inside|direction
そと|外|outside|direction
きた|北|north|direction
みなみ|南|south|direction
ひがし|東|east|direction
にし|西|west|direction
トイレ||toilet|place
ホテル||hotel|place
コンビニ||convenience store|place
ぎんこう|銀行|bank|place
ゆうびんきょく|郵便局|post office|place
びょういん|病院|hospital|place
くすりや|薬屋|pharmacy|place
レストラン||restaurant|place
みせ|店|shop|place
デパート||department store|place
こうえん|公園|park|place
おてら|お寺|temple|place
じんじゃ|神社|shrine|place
びじゅつかん|美術館|art museum|place
はくぶつかん|博物館|museum|place
おんせん|温泉|hot spring|place
うみ|海|sea|place
やま|山|mountain|place
まち|町|town|place
こうばん|交番|police box|place
いざかや|居酒屋|izakaya (Japanese pub)|place
これ||this|shop
それ||that (near you)|shop
あれ||that (over there)|shop
いくら||how much|shop
えん|円|yen|shop
おかね|お金|money|shop
カード||card|shop
げんきん|現金|cash|shop
レシート||receipt|shop
ふくろ|袋|bag|shop
おみやげ|お土産|souvenir|shop
ふく|服|clothes|shop
くつ|靴|shoes|shop
ティーシャツ|Tシャツ|T-shirt|shop
サイズ||size|shop
セール||sale|shop
めんぜい|免税|tax-free|shop
しちゃく|試着|trying on (clothes)|shop
いろ|色|colour|color
あか|赤|red|color
あお|青|blue|color
しろ|白|white|color
くろ|黒|black|color
きいろ|黄色|yellow|color
みどり|緑|green|color
へや|部屋|room|hotel
かぎ|鍵|key|hotel
よやく|予約|reservation|hotel
チェックイン||check-in|hotel
チェックアウト||check-out|hotel
にもつ|荷物|luggage|hotel
タオル||towel|hotel
まくら|枕|pillow|hotel
ふとん|布団|futon|hotel
エアコン||air conditioner|hotel
ワイファイ|Wi-Fi|Wi-Fi|hotel
パスワード||password|hotel
フロント||front desk|hotel
エレベーター||elevator|hotel
かいだん|階段|stairs|hotel
おふろ|お風呂|bath|hotel
シャワー||shower|hotel
まど|窓|window|hotel
いま|今|now|time
きょう|今日|today|time
あした|明日|tomorrow|time
きのう|昨日|yesterday|time
あさ|朝|morning|time
ひる|昼|midday|time
よる|夜|night|time
ゆうがた|夕方|early evening|time
まいにち|毎日|every day|time
しゅうまつ|週末|weekend|time
なんじ|何時|what time|time
じかん|時間|time, hours|time
はん|半|half past|time
ごぜん|午前|a.m.|time
ごご|午後|p.m.|time
らいしゅう|来週|next week|time
せんしゅう|先週|last week|time
こんばん|今晩|tonight|time
げつようび|月曜日|Monday|day
かようび|火曜日|Tuesday|day
すいようび|水曜日|Wednesday|day
もくようび|木曜日|Thursday|day
きんようび|金曜日|Friday|day
どようび|土曜日|Saturday|day
にちようび|日曜日|Sunday|day
ひとつ|一つ|one (thing)|count
ふたつ|二つ|two (things)|count
みっつ|三つ|three (things)|count
よっつ|四つ|four (things)|count
いつつ|五つ|five (things)|count
むっつ|六つ|six (things)|count
ななつ|七つ|seven (things)|count
やっつ|八つ|eight (things)|count
ここのつ|九つ|nine (things)|count
とお|十|ten (things)|count
いくつ||how many (things)|count
ひとり|一人|one person|count
ふたり|二人|two people|count
さんにん|三人|three people|count
よにん|四人|four people|count
なんにん|何人|how many people|count
いちまい|一枚|one (flat thing: ticket, sheet)|count
にまい|二枚|two (flat things)|count
さんまい|三枚|three (flat things)|count
いっぽん|一本|one (long thing: bottle, pen)|count
にほん|二本|two (long things)|count
さんぼん|三本|three (long things)|count
おいしい|美味しい|delicious|adj
まずい||tastes bad|adj
からい|辛い|spicy|adj
あまい|甘い|sweet|adj
おおきい|大きい|big|adj
ちいさい|小さい|small|adj
あたらしい|新しい|new|adj
ふるい|古い|old (things)|adj
あつい|暑い|hot (weather)|adj
さむい|寒い|cold (weather)|adj
つめたい|冷たい|cold (to the touch)|adj
あたたかい|温かい|warm|adj
いい||good|adj
わるい|悪い|bad|adj
きれい||pretty, clean|adj
しずか|静か|quiet|adj
にぎやか||lively|adj
たのしい|楽しい|fun|adj
すごい||amazing|adj
かわいい||cute|adj
やすい|安い|cheap|adj
たかい|高い|expensive, tall|adj
はやい|早い|early, fast|adj
おそい|遅い|late, slow|adj
ちかい|近い|near|adj
とおい|遠い|far|adj
むずかしい|難しい|difficult|adj
かんたん|簡単|easy|adj
げんき|元気|well, full of energy|adj
いそがしい|忙しい|busy|adj
だいじょうぶ|大丈夫|okay, all right|adj
すき|好き|liked (I like it)|adj
きらい|嫌い|disliked|adj
いきます|行きます|go|verb
きます|来ます|come|verb
かえります|帰ります|go home, go back|verb
たべます|食べます|eat|verb
のみます|飲みます|drink|verb
かいます|買います|buy|verb
みます|見ます|see, watch|verb
ききます|聞きます|listen, ask|verb
はなします|話します|speak|verb
よみます|読みます|read|verb
かきます|書きます|write|verb
わかります|分かります|understand|verb
します||do|verb
あります||there is, have (things)|verb
います||there is (people, animals)|verb
まちます|待ちます|wait|verb
とまります|泊まります|stay overnight|verb
のります|乗ります|get on, ride|verb
おります|降ります|get off|verb
あるきます|歩きます|walk|verb
つかいます|使います|use|verb
はいります|入ります|enter|verb
でます|出ます|leave, go out|verb
とります|撮ります|take (a photo)|verb
あいます|会います|meet|verb
すみます|住みます|live (somewhere)|verb
はたらきます|働きます|work|verb
やすみます|休みます|rest, take a day off|verb
おしえます|教えます|teach, tell|verb
てつだいます|手伝います|help|verb
いたい|痛い|painful, it hurts|health
くすり|薬|medicine|health
あたま|頭|head|health
おなか|お腹|stomach|health
のど|喉|throat|health
ねつ|熱|fever|health
かぜ|風邪|a cold|health
アレルギー||allergy|health
いしゃ|医者|doctor|health
きゅうきゅうしゃ|救急車|ambulance|health
けいさつ|警察|police|health
たすけて|助けて|help!|health
あぶない|危ない|dangerous, look out|health
さいふ|財布|wallet|health
パスポート||passport|health
びょうき|病気|illness, sick|health
なに|何|what|ask
だれ|誰|who|ask
いつ||when|ask
どれ||which one|ask
どうして||why|ask
ちょっと||a little, a moment|ask
たくさん||a lot|ask
ぜんぶ|全部|all, everything|ask
しゃしん|写真|photo|ask
しゅみ|趣味|hobby|ask
おんがく|音楽|music|ask
ギター||guitar|ask
うた|歌|song|ask
`;

import { romaji } from './kana.js';
const slug = s => s.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/gi, '').toLowerCase();
const seen = new Set();
export const VOCAB = RAW.trim().split('\n').map(l => {
  const [kana, kj, en, theme] = l.split('|');
  let id = slug(romaji(kana));
  if (seen.has(id)) id += '2';
  seen.add(id);
  return { id: 'jp:word:' + id, kind: 'word', jp: kana, kj: kj || '', en, theme, ro: romaji(kana) };
});
export const THEMES = {
  greet: 'Greetings', people: 'People & you', food: 'Food', menu: 'Cafe menu', drink: 'Drinks', transport: 'Trains & transport',
  direction: 'Directions', place: 'Places', shop: 'Shopping & money', color: 'Colours', hotel: 'Hotel', time: 'Time',
  day: 'Days', count: 'Counting things', adj: 'Describing words', verb: 'Action words', health: 'Health & emergencies', ask: 'Question & useful words',
};

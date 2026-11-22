// Survival phrases. Format: kana with spaces between word chunks | usual written form | English | theme | id
// Spaces split chunks for the sentence builder; standalone は/を/へ are particles (wa/o/e).
const RAW = `
おはよう ございます|おはようございます|Good morning|greet|ohayo
こんにちは|こんにちは|Hello|greet|konnichiwa
こんばんは|こんばんは|Good evening|greet|konbanwa
ありがとう ございます|ありがとうございます|Thank you very much|greet|arigato
どう いたしまして|どういたしまして|You're welcome|greet|douitashimashite
すみません|すみません|Excuse me / sorry|greet|sumimasen
ごめんなさい|ごめんなさい|I'm sorry|greet|gomennasai
はじめまして|初めまして|Nice to meet you|greet|hajimemashite
よろしく おねがいします|よろしくお願いします|Pleased to meet you|greet|yoroshiku
わたし は シヴァンシュ です|私はシヴァンシュです|I am Shivanshu|greet|watashiwa
インド から きました|インドから来ました|I came from India|greet|indokara
おげんき ですか|お元気ですか|How are you?|greet|ogenki
げんき です|元気です|I'm fine|greet|genki
さようなら|さようなら|Goodbye|greet|sayonara
また ね|またね|See you!|greet|matane
おやすみなさい|おやすみなさい|Good night|greet|oyasumi
いただきます|いただきます|(said before eating)|greet|itadakimasu
ごちそうさま でした|ごちそうさまでした|Thanks for the meal|greet|gochisousama
わかりません|分かりません|I don't understand|help|wakarimasen
わかりました|分かりました|I understand / got it|help|wakarimashita
もう いちど おねがいします|もう一度お願いします|Once more, please|help|mouichido
ゆっくり おねがいします|ゆっくりお願いします|Slowly, please|help|yukkuri
えいご は はなせますか|英語は話せますか|Can you speak English?|help|eigowa
にほんご は すこし だけ です|日本語は少しだけです|I speak only a little Japanese|help|sukoshi
これ は なん ですか|これは何ですか|What is this?|help|korewanan
にほんご で なん ですか|日本語で何ですか|What is it in Japanese?|help|nihongode
ちょっと まって ください|ちょっと待ってください|Please wait a moment|help|chottomatte
だいじょうぶ です|大丈夫です|I'm okay / no thanks|help|daijoubu
はい そう です|はい、そうです|Yes, that's right|help|haisou
かいて ください|書いてください|Please write it down|help|kaite
これ を ください|これをください|This one, please|order|koreo
みず を ください|水をください|Water, please|order|mizuo
メニュー を ください|メニューをください|The menu, please|order|menyuo
おすすめ は なん ですか|おすすめは何ですか|What do you recommend?|order|osusume
これ に します|これにします|I'll have this|order|koreni
ひとり です|一人です|Just one person|order|hitori
ふたり です|二人です|Two people|order|futari
おかいけい おねがいします|お会計お願いします|The bill, please|order|okaikei
カード で いい ですか|カードでいいですか|Is card okay?|order|kaado
げんきん で はらいます|現金で払います|I'll pay in cash|order|genkin
とても おいしい です|とても美味しいです|It's very delicious|order|oishii
にく は たべません|肉は食べません|I don't eat meat|order|nikuwa
ベジタリアン です|ベジタリアンです|I'm vegetarian|order|vege
からく しないで ください|辛くしないでください|Not spicy, please|order|karaku
ビール を ふたつ ください|ビールを二つください|Two beers, please|order|biiru2
おかわり ください|おかわりください|Another helping, please|order|okawari
もちかえり で|持ち帰りで|To take away, please|order|mochikaeri
てんない で|店内で|For here, please|order|tennai
かんぱい|乾杯|Cheers!|order|kanpai
ふくろ は いりません|袋はいりません|I don't need a bag|order|fukuro
えき は どこ ですか|駅はどこですか|Where is the station?|go|ekiwa
トイレ は どこ ですか|トイレはどこですか|Where is the toilet?|go|toirewa
ここ から とおい ですか|ここから遠いですか|Is it far from here?|go|tooi
あるいて いけますか|歩いて行けますか|Can I walk there?|go|aruite
まっすぐ いって ください|まっすぐ行ってください|Please go straight|go|massugu
みぎ に まがって ください|右に曲がってください|Please turn right|go|migini
ひだり に まがって ください|左に曲がってください|Please turn left|go|hidarini
ちず で おしえて ください|地図で教えてください|Please show me on the map|go|chizude
きょうと まで おとな いちまい|京都まで大人一枚|One adult ticket to Kyoto|go|kyotomade
この でんしゃ は きょうと に いきますか|この電車は京都に行きますか|Does this train go to Kyoto?|go|kono_densha
なんばんせん ですか|何番線ですか|Which platform is it?|go|nanbansen
つぎ は なに えき ですか|次は何駅ですか|What's the next station?|go|tsugi
ここ で おります|ここで降ります|I'll get off here|go|koko_de
この じゅうしょ まで おねがいします|この住所までお願いします|To this address, please|go|jusho
ここ で とめて ください|ここで止めてください|Please stop here|go|tomete
どのくらい かかりますか|どのくらいかかりますか|How long does it take?|go|donokurai
みち に まよいました|道に迷いました|I'm lost|go|mayoi
いくら ですか|いくらですか|How much is it?|shop|ikura
これ は いくら ですか|これはいくらですか|How much is this?|shop|korewaikura
みて いる だけ です|見ているだけです|I'm just looking|shop|miteiru
しちゃく して も いい ですか|試着してもいいですか|May I try it on?|shop|shichaku
もっと おおきい の は ありますか|もっと大きいのはありますか|Do you have a bigger one?|shop|ookii
もっと ちいさい の は ありますか|もっと小さいのはありますか|Do you have a smaller one?|shop|chiisai
ほか の いろ は ありますか|他の色はありますか|Do you have other colours?|shop|hoka
めんぜい できますか|免税できますか|Can I buy it tax-free?|shop|menzei
たかい です ね|高いですね|That's expensive|shop|takai
レシート を ください|レシートをください|A receipt, please|shop|receipt
よやく して います|予約しています|I have a reservation|hotel|yoyaku_shite
チェックイン おねがいします|チェックインお願いします|Check-in, please|hotel|checkin
にもつ を あずかって もらえますか|荷物を預かってもらえますか|Can you keep my luggage?|hotel|nimotsu
ワイファイ の パスワード は なん ですか|Wi-Fiのパスワードは何ですか|What's the Wi-Fi password?|hotel|wifi
チェックアウト は なんじ ですか|チェックアウトは何時ですか|What time is check-out?|hotel|checkout
あさごはん は ついて いますか|朝ご飯は付いていますか|Is breakfast included?|hotel|asagohan
へや の かぎ を なくしました|部屋の鍵を無くしました|I lost my room key|hotel|kagi
タオル を もう ひとつ ください|タオルをもう一つください|One more towel, please|hotel|towel
いま なんじ ですか|今何時ですか|What time is it now?|time|imananji
なんじ に あきますか|何時に開きますか|What time does it open?|time|akimasu
なんじ まで ですか|何時までですか|Until what time?|time|nanjimade
きょう は なんようび ですか|今日は何曜日ですか|What day is it today?|time|nanyoubi
あした また きます|明日また来ます|I'll come again tomorrow|time|ashita
おてら に いきたい です|お寺に行きたいです|I want to go to a temple|want|otera
すし が たべたい です|寿司が食べたいです|I want to eat sushi|want|sushiga
しゃしん を とって も いい ですか|写真を撮ってもいいですか|May I take a photo?|want|shashin_ii
しゃしん を とって ください|写真を撮ってください|Please take a photo (of me)|want|shashin_kudasai
てつだって ください|手伝ってください|Please help me|want|tetsudatte
いっしょ に いきませんか|一緒に行きませんか|Would you like to go together?|social|issho
いきましょう|行きましょう|Let's go|social|ikimashou
のみ に いきませんか|飲みに行きませんか|Shall we go for a drink?|social|nomini
いい です ね|いいですね|Sounds good|social|iidesune
ざんねん です が ちょっと|残念ですがちょっと…|Sorry, I can't (polite no)|social|zannen
にほん は はじめて です|日本は初めてです|It's my first time in Japan|social|hajimete
にかいめ です|二回目です|It's my second time|social|nikaime
しごと は エンジニア です|仕事はエンジニアです|I work as an engineer|social|engineer
しゅみ は ギター です|趣味はギターです|My hobby is guitar|social|shumi
にほん が だいすき です|日本が大好きです|I love Japan|social|daisuki
インド に いった こと が ありますか|インドに行ったことがありますか|Have you ever been to India?|social|indoni
カレー が すき ですか|カレーが好きですか|Do you like curry?|social|curry
おなまえ は なん ですか|お名前は何ですか|What is your name?|social|onamae
ライン を こうかん しませんか|LINEを交換しませんか|Shall we swap LINE contacts?|social|line
たのしかった です|楽しかったです|That was fun|social|tanoshikatta
また あいましょう|また会いましょう|Let's meet again|social|mataai
たすけて|助けて|Help!|health|tasukete
きゅうきゅうしゃ を よんで ください|救急車を呼んでください|Please call an ambulance|health|kyukyusha
けいさつ を よんで ください|警察を呼んでください|Please call the police|health|keisatsu
あたま が いたい です|頭が痛いです|I have a headache|health|atama
おなか が いたい です|お腹が痛いです|My stomach hurts|health|onaka
ねつ が あります|熱があります|I have a fever|health|netsu
かぜ の くすり は ありますか|風邪の薬はありますか|Do you have cold medicine?|health|kazegusuri
アレルギー が あります|アレルギーがあります|I have an allergy|health|allergy
さいふ を なくしました|財布を無くしました|I lost my wallet|health|saifu
びょういん は どこ ですか|病院はどこですか|Where is a hospital?|health|byouin
くつ を ぬぎますか|靴を脱ぎますか|Should I take off my shoes?|manners|kutsu
なか に はいって も いい ですか|中に入ってもいいですか|May I go inside?|manners|naka
よやく を したい です|予約をしたいです|I'd like to make a reservation|manners|yoyaku_shitai
こんばん しちじ に ふたり です|今晩七時に二人です|Tonight at seven, two people|manners|konban
`;

import { romaji } from './kana.js';
export const PHRASES = RAW.trim().split('\n').map(l => {
  const [tok, kj, en, theme, id] = l.split('|');
  return { id: 'jp:phr:' + id, kind: 'phr', jp: tok.replace(/ /g, ''), tokens: tok.split(' '), kj, en, theme, ro: romaji(tok) };
});
export const PHRASE_THEMES = { greet: 'Greetings', help: 'Getting help', order: 'Ordering', go: 'Getting around', shop: 'Shopping', hotel: 'Hotel', time: 'Time', want: 'Wants & requests', social: 'Making friends', health: 'Health & emergencies', manners: 'Manners & bookings' };

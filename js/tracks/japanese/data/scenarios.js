// Conversation scenarios. Each step: ctx (situation, English), npc [kana with spaces, English],
// ch: choices [kana with spaces, English, ok(1 = good reply), why (shown when wrong), goto (optional step index)].
// A step with no `goto` on the chosen reply continues to the next step.
import { romaji } from './kana.js';

const S = {
  konbini: { title: 'At the konbini', place: 'Convenience store, Tokyo', steps: [
    { ctx: 'You walk in. The staff call out:', npc: ['いらっしゃいませ', 'Welcome!'], ch: [['こんにちは', 'Hello', 1], ['いらっしゃいませ', 'Welcome', 0, 'Only staff say this.'], ['いただきます', 'Said before eating', 0, 'You say this before a meal.']] },
    { ctx: 'You put a bento on the counter.', npc: ['おべんとう あたためますか', 'Shall I heat up the bento?'], ch: [['はい おねがいします', 'Yes, please', 1, '', 2], ['いいえ だいじょうぶ です', 'No, it’s fine', 1, '', 3], ['おやすみなさい', 'Good night', 0, 'That means good night.']] },
    { ctx: 'She puts it in the microwave.', npc: ['しょうしょう おまち ください', 'Please wait a moment.'], ch: [['はい', 'Okay', 1], ['さようなら', 'Goodbye', 0, 'You are not leaving yet.'], ['かんぱい', 'Cheers!', 0, 'That is for drinks.']] },
    { ctx: 'She asks about a bag.', npc: ['ふくろ は ごりよう ですか', 'Would you like a bag?'], ch: [['ふくろ は いりません', 'I don’t need a bag', 1], ['はい おねがいします', 'Yes, please', 1], ['おかいけい おねがいします', 'The bill, please', 0, 'Answer the bag question first.']] },
    { ctx: 'She tells you the price.', npc: ['ろっぴゃく はちじゅう えん です', 'That’s 680 yen.'], ch: [['カード で いい ですか', 'Is card okay?', 1], ['いくら ですか', 'How much?', 0, 'She just said it: 680 yen.'], ['ろっぴゃく えん です ね', '600 yen, right?', 0, 'Listen again: ろっぴゃくはちじゅう = 680.']] },
    { ctx: 'She hands you the receipt.', npc: ['はい どうぞ レシート です', 'Here you are, your receipt.'], ch: [['ありがとう ございます', 'Thank you very much', 1], ['いただきます', 'Said before eating', 0, 'Say thank you instead.'], ['はじめまして', 'Nice to meet you', 0, 'That is for first meetings.']] },
  ] },
  ramen: { title: 'Ordering ramen', place: 'Ramen shop, Osaka', steps: [
    { ctx: 'You walk in. The staff shout:', npc: ['いらっしゃいませ', 'Welcome!'], ch: [['こんにちは', 'Hello', 1], ['いらっしゃいませ', 'Welcome', 0, 'Only staff say this.'], ['さようなら', 'Goodbye', 0, 'You just arrived.']] },
    { ctx: 'They ask how many people.', npc: ['なんめいさま ですか', 'How many people?'], ch: [['ひとり です', 'Just one person', 1], ['ひとつ ください', 'One item, please', 0, 'ひとつ counts things, not people.'], ['いくら ですか', 'How much?', 0, 'They asked how many people.']] },
    { ctx: 'You sit down. You have no idea what to order.', npc: ['ごちゅうもん は', 'Your order?'], ch: [['おすすめ は なん ですか', 'What do you recommend?', 1], ['トイレ は どこ ですか', 'Where is the toilet?', 0, 'Order first!'], ['また ね', 'See you', 0, 'You are not leaving.']] },
    { ctx: 'The chef points at the menu.', npc: ['とんこつ ラーメン が おすすめ です', 'Tonkotsu ramen is our special.'], ch: [['じゃ それ を ください', 'Then that one, please', 1], ['おやすみなさい', 'Good night', 0, 'That means good night.'], ['はじめまして', 'Nice to meet you', 0, 'Not a first meeting phrase here.']] },
    { ctx: 'Drinks?', npc: ['おのみもの は', 'Something to drink?'], ch: [['みず を ください', 'Water, please', 1], ['ビール を ひとつ ください', 'One beer, please', 1], ['ひとり です', 'Just one person', 0, 'They asked about drinks.']] },
    { ctx: 'The bowl arrives. Before you eat, you say:', npc: ['おまたせ しました', 'Sorry to keep you waiting.'], ch: [['いただきます', '(said before eating)', 1], ['ごちそうさま でした', 'Thanks for the meal', 0, 'Say that AFTER eating.'], ['いらっしゃいませ', 'Welcome', 0, 'Only staff say this.']] },
    { ctx: 'You finish and stand up to pay.', npc: ['ありがとう ございます', 'Thank you!'], ch: [['ごちそうさま でした', 'Thanks for the meal', 1], ['いただきます', 'Said before eating', 0, 'You say this before you eat.'], ['よろしく おねがいします', 'Pleased to meet you', 0, 'Not here.']] },
  ] },
  izakaya: { title: 'Night at the izakaya', place: 'Izakaya, Shinjuku', steps: [
    { ctx: 'You arrive with two friends. Three people.', npc: ['なんめいさま ですか', 'How many people?'], ch: [['さんにん です', 'Three people', 1], ['みっつ です', 'Three (things)', 0, 'Use さんにん for people.'], ['ふたり です', 'Two people', 0, 'You are three.']] },
    { ctx: 'Everyone wants beer.', npc: ['おのみもの は どう しますか', 'What would you like to drink?'], ch: [['ビール を みっつ ください', 'Three beers, please', 1], ['ビール を ふたつ ください', 'Two beers, please', 0, 'There are three of you.'], ['みず を ください', 'Water, please', 0, 'Everyone wants beer.']] },
    { ctx: 'Drinks arrive. Your friend raises a glass.', npc: ['かんぱい', 'Cheers!'], ch: [['かんぱい', 'Cheers!', 1], ['いただきます', 'Said before eating', 0, 'Raise your glass: kanpai!'], ['すみません', 'Excuse me', 0, 'Join the toast!']] },
    { ctx: 'The waiter recommends a dish.', npc: ['やきとり が おすすめ です', 'The grilled chicken is recommended.'], ch: [['じゃ それ を ふたつ ください', 'Then two of those, please', 1], ['ベジタリアン です', 'I’m vegetarian', 1], ['わかりません', 'I don’t understand', 0, 'やきとり = grilled chicken. You can order it.']] },
    { ctx: 'Later, the last order call.', npc: ['ラストオーダー です', 'Last orders.'], ch: [['もう だいじょうぶ です', 'We’re fine, thanks', 1], ['おかわり ください', 'Another one, please', 1], ['はじめまして', 'Nice to meet you', 0, 'Not now.']] },
    { ctx: 'You ask for the bill. They ask how to split it.', npc: ['おかいけい は べつべつ に しますか', 'Separate bills?'], ch: [['いっしょ で おねがいします', 'Together, please', 1], ['べつべつ で おねがいします', 'Separately, please', 1], ['ここ で おります', 'I’ll get off here', 0, 'That is for trains.']] },
  ] },
  train: { title: 'Bullet train ticket', place: 'Shin-Osaka station', steps: [
    { ctx: 'At the ticket counter.', npc: ['どちら まで ですか', 'Where to?'], ch: [['きょうと まで おとな いちまい', 'One adult to Kyoto', 1], ['きょうと は どこ ですか', 'Where is Kyoto?', 0, 'Say where you are going.'], ['いくら ですか', 'How much?', 0, 'Tell them your destination first.']] },
    { ctx: 'Seat type?', npc: ['していせき と じゆうせき が あります', 'There are reserved and unreserved seats.'], ch: [['じゆうせき で おねがいします', 'Unreserved, please', 1], ['していせき で おねがいします', 'Reserved, please', 1], ['ひとり です', 'Just one person', 0, 'They asked which seat type.']] },
    { ctx: 'The price.', npc: ['にせん さんびゃく えん です', 'That’s 2,300 yen.'], ch: [['カード で いい ですか', 'Is card okay?', 1], ['にせん えん です ね', '2,000 yen, right?', 0, 'にせんさんびゃく = 2,300.'], ['ごちそうさま でした', 'Thanks for the meal', 0, 'That is for meals.']] },
    { ctx: 'On the platform you check with a staff member.', npc: ['はい なん でしょう', 'Yes, how can I help?'], ch: [['この でんしゃ は きょうと に いきますか', 'Does this train go to Kyoto?', 1], ['いただきます', 'Said before eating', 0, 'Ask about the train.'], ['こんばんは', 'Good evening', 0, 'Ask your question.']] },
    { ctx: 'Listen carefully: which platform?', npc: ['いいえ にばんせん です', 'No, it’s platform 2.'], ch: [['にばんせん です ね', 'Platform 2, right?', 1], ['さんばんせん です ね', 'Platform 3, right?', 0, 'に = 2.'], ['いちばんせん です ね', 'Platform 1, right?', 0, 'に = 2.']] },
    { ctx: 'She nods.', npc: ['はい そう です', 'Yes, that’s right.'], ch: [['ありがとう ございます', 'Thank you very much', 1], ['すみません もう いちど', 'Sorry, once more', 1], ['いらっしゃいませ', 'Welcome', 0, 'Staff say that.']] },
  ] },
  directions: { title: 'Lost in the city', place: 'Side street, Tokyo', steps: [
    { ctx: 'You are lost. You stop someone.', npc: ['はい', 'Yes?'], ch: [['すみません えき は どこ ですか', 'Excuse me, where is the station?', 1], ['おいしい です', 'It’s delicious', 0, 'Ask for directions.'], ['かんぱい', 'Cheers', 0, 'Ask for directions.']] },
    { ctx: 'They answer very fast. You did not catch it.', npc: ['まっすぐ いって つぎ の しんごう を みぎ です', 'Go straight, then right at the next light.'], ch: [['すみません ゆっくり おねがいします', 'Sorry, slowly please', 1], ['わかりました', 'I understand', 0, 'You did not catch it. Ask them to slow down.'], ['また ね', 'See you', 0, 'You still need help.']] },
    { ctx: 'They repeat it slowly. Which way?', npc: ['まっすぐ いって みぎ です', 'Straight, then right.'], ch: [['まっすぐ みぎ です ね', 'Straight, then right, yes?', 1], ['まっすぐ ひだり です ね', 'Straight, then left, yes?', 0, 'みぎ = right.'], ['うえ です ね', 'Up, yes?', 0, 'みぎ = right.']] },
    { ctx: 'You want to know the distance.', npc: ['はい そう です', 'Yes, that’s right.'], ch: [['ここ から とおい ですか', 'Is it far from here?', 1], ['これ は なん ですか', 'What is this?', 0, 'Ask about the distance.'], ['チェックイン おねがいします', 'Check-in, please', 0, 'You are on the street.']] },
    { ctx: 'Their answer:', npc: ['いいえ ちかい です。 ごふん ぐらい です', 'No, it’s close. About five minutes.'], ch: [['ありがとう ございます', 'Thank you very much', 1], ['とおい です ね', 'It’s far, isn’t it', 0, 'ちかい = near.'], ['ごめんなさい', 'I’m sorry', 0, 'Say thank you.']] },
  ] },
  hotel: { title: 'Hotel check-in', place: 'Hotel front desk, Kyoto', steps: [
    { ctx: 'You reach the front desk.', npc: ['いらっしゃいませ', 'Welcome.'], ch: [['チェックイン おねがいします', 'Check-in, please', 1], ['チェックアウト は なんじ ですか', 'When is check-out?', 0, 'Check in first.'], ['いただきます', 'Said before eating', 0, 'Not a meal.']] },
    { ctx: 'Your name?', npc: ['おなまえ を おねがいします', 'Your name, please.'], ch: [['シヴァンシュ です。 よやく して います', 'Shivanshu. I have a reservation.', 1], ['インド です', 'India', 0, 'Give your name.'], ['ひとり です', 'One person', 0, 'Give your name.']] },
    { ctx: 'They need your passport.', npc: ['パスポート を おねがいします', 'Your passport, please.'], ch: [['はい どうぞ', 'Here you are', 1], ['いりません', 'I don’t need it', 0, 'Hotels must check passports of visitors.'], ['ごめんなさい', 'I’m sorry', 0, 'Just hand it over.']] },
    { ctx: 'Room info.', npc: ['おへや は ごかい です', 'Your room is on the 5th floor.'], ch: [['ワイファイ の パスワード は なん ですか', 'What’s the Wi-Fi password?', 1], ['あさごはん は ついて いますか', 'Is breakfast included?', 1], ['きっぷ を ください', 'A ticket, please', 0, 'That is for trains.']] },
    { ctx: 'They hand you a card.', npc: ['こちら です', 'It’s here.'], ch: [['チェックアウト は なんじ ですか', 'What time is check-out?', 1], ['しちゃく して も いい ですか', 'May I try it on?', 0, 'That is for clothes.'], ['かんぱい', 'Cheers', 0, 'Not now.']] },
    { ctx: 'Check-out time:', npc: ['じゅういちじ です', 'It’s 11 o’clock.'], ch: [['わかりました。 ありがとう ございます', 'Got it. Thank you.', 1], ['じゅうじ です ね', '10 o’clock, right?', 0, 'じゅういち = 11.'], ['いちじ です ね', '1 o’clock, right?', 0, 'じゅういち = 11.']] },
  ] },
  clothes: { title: 'Shopping for clothes', place: 'Clothes shop, Harajuku', steps: [
    { ctx: 'A shop assistant greets you.', npc: ['いらっしゃいませ。 なにか おさがし ですか', 'Welcome. Looking for something?'], ch: [['みて いる だけ です', 'I’m just looking', 1], ['こんにちは', 'Hello', 1], ['いらっしゃいませ', 'Welcome', 0, 'Only staff say this.']] },
    { ctx: 'You like a shirt and want to try it.', npc: ['どうぞ ゆっくり', 'Take your time.'], ch: [['しちゃく して も いい ですか', 'May I try it on?', 1], ['ふくろ は いりません', 'I don’t need a bag', 0, 'Ask to try it on.'], ['えき は どこ ですか', 'Where is the station?', 0, 'Not now.']] },
    { ctx: 'It is too small.', npc: ['いかが ですか', 'How is it?'], ch: [['もっと おおきい の は ありますか', 'Do you have a bigger one?', 1], ['もっと ちいさい の は ありますか', 'Do you have a smaller one?', 0, 'It is too small: you need bigger.'], ['とても おいしい です', 'It’s delicious', 0, 'Not food!']] },
    { ctx: 'They bring a bigger size.', npc: ['エル サイズ が あります', 'We have it in L.'], ch: [['いくら ですか', 'How much is it?', 1], ['これ に します', 'I’ll take this', 1], ['もう いちど おねがいします', 'Once more, please', 1]] },
    { ctx: 'The price:', npc: ['さんぜん はっぴゃく えん です', 'It’s 3,800 yen.'], ch: [['めんぜい できますか', 'Can I buy it tax-free?', 1], ['さんぜん えん です ね', '3,000 yen, right?', 0, 'はっぴゃく = 800. 3,800 yen.'], ['ごちそうさま でした', 'Thanks for the meal', 0, 'Not a meal.']] },
    { ctx: 'The reply:', npc: ['めんぜい は ごせん えん から です', 'Tax-free starts from 5,000 yen.'], ch: [['わかりました。 これ に します', 'I see. I’ll take this.', 1], ['ごせん えん です ね', 'It’s 5,000 yen?', 0, 'The shirt is 3,800. Tax-free starts at 5,000.'], ['たすけて', 'Help!', 0, 'No emergency here.']] },
  ] },
  temple: { title: 'Temple manners', place: 'Temple, Kyoto', steps: [
    { ctx: 'A monk greets you at the gate.', npc: ['こんにちは', 'Hello.'], ch: [['こんにちは', 'Hello', 1], ['かんぱい', 'Cheers', 0, 'Not at a temple!'], ['いらっしゃいませ', 'Welcome', 0, 'Only staff say this.']] },
    { ctx: 'You see shoes lined up at the hall entrance.', npc: ['どうぞ', 'Please go ahead.'], ch: [['くつ を ぬぎますか', 'Should I take off my shoes?', 1], ['くつ を ください', 'Shoes, please', 0, 'Ask if you should take them off.'], ['トイレ は どこ ですか', 'Where is the toilet?', 0, 'Ask about the shoes.']] },
    { ctx: 'His answer:', npc: ['はい ここ で ぬいで ください', 'Yes, please take them off here.'], ch: [['わかりました', 'Understood', 1], ['いいえ', 'No', 0, 'Please follow the custom.'], ['いくら ですか', 'How much?', 0, 'Take off your shoes.']] },
    { ctx: 'You want a photo of the hall.', npc: ['ほか に なにか', 'Anything else?'], ch: [['しゃしん を とって も いい ですか', 'May I take a photo?', 1], ['しゃしん を とって ください', 'Please take a photo of me', 0, 'Ask if photos are allowed.'], ['めんぜい できますか', 'Tax-free?', 0, 'Not a shop.']] },
    { ctx: 'The rule:', npc: ['なか は だめ です。 そと は いい です', 'Not inside. Outside is fine.'], ch: [['わかりました。 そと で とります', 'Understood. I’ll take it outside.', 1], ['なか で とります', 'I’ll take it inside', 0, 'だめ means not allowed.'], ['もう いちど おねがいします', 'Once more, please', 1]] },
    { ctx: 'He offers a lucky charm.', npc: ['おまもり は いかが ですか', 'Would you like a charm?'], ch: [['いくら ですか', 'How much is it?', 1], ['いいえ だいじょうぶ です', 'No, thank you', 1], ['ビール を ください', 'A beer, please', 0, 'Not at a temple!']] },
  ] },
  smalltalk: { title: 'Talking about India', place: 'Hostel lounge, Kyoto', steps: [
    { ctx: 'A local student sits next to you.', npc: ['こんにちは。 どこ から きましたか', 'Hi. Where are you from?'], ch: [['インド から きました', 'I came from India', 1], ['えき から きました', 'I came from the station', 0, 'They mean your country.'], ['いいえ', 'No', 0, 'Say where you are from.']] },
    { ctx: 'She is curious.', npc: ['インド の どこ ですか', 'Where in India?'], ch: [['デリー の ちかく です', 'Near Delhi', 1], ['インド は どこ ですか', 'Where is India?', 0, 'Answer her question.'], ['わかりません', 'I don’t know', 0, 'You know where you live!']] },
    { ctx: 'She asks if it is your first visit.', npc: ['にほん は はじめて ですか', 'Is this your first time in Japan?'], ch: [['いいえ にかいめ です', 'No, it’s my second time', 1], ['はい はじめて です', 'Yes, it’s my first time', 1], ['はじめまして', 'Nice to meet you', 0, 'Listen: はじめて = first time.']] },
    { ctx: 'Your job?', npc: ['おしごと は なん ですか', 'What do you do?'], ch: [['しごと は エンジニア です', 'I work as an engineer', 1], ['しゅみ は ギター です', 'My hobby is guitar', 0, 'She asked about work.'], ['ちょっと まって ください', 'Wait a moment', 0, 'Answer her.']] },
    { ctx: 'Hobbies?', npc: ['しゅみ は なん ですか', 'What are your hobbies?'], ch: [['しゅみ は ギター です', 'My hobby is guitar', 1], ['しごと は エンジニア です', 'I’m an engineer', 0, 'She asked about hobbies.'], ['にく は たべません', 'I don’t eat meat', 0, 'Not about food.']] },
    { ctx: 'Ask her something back.', npc: ['すごい。 わたし も おんがく が すき です', 'Cool. I like music too.'], ch: [['インド に いった こと が ありますか', 'Have you ever been to India?', 1], ['カレー が すき ですか', 'Do you like curry?', 1], ['さようなら', 'Goodbye', 0, 'Keep the talk going!']] },
    { ctx: 'Time to go.', npc: ['たのしかった です。 また あいましょう', 'That was fun. Let’s meet again.'], ch: [['はい また あいましょう', 'Yes, let’s meet again', 1], ['いただきます', 'Said before eating', 0, 'Say goodbye.'], ['すみません', 'Excuse me', 0, 'Say goodbye nicely.']] },
  ] },
  taxi: { title: 'Taking a taxi', place: 'Taxi, Tokyo', steps: [
    { ctx: 'You get in. The driver asks:', npc: ['どちら まで ですか', 'Where to?'], ch: [['この じゅうしょ まで おねがいします', 'To this address, please', 1], ['ここ で おります', 'I’ll get off here', 0, 'You just got in.'], ['なんばんせん ですか', 'Which platform?', 0, 'That is for trains.']] },
    { ctx: 'He reads your phone.', npc: ['かしこまりました', 'Certainly.'], ch: [['どのくらい かかりますか', 'How long does it take?', 1], ['おかわり ください', 'Another helping', 0, 'Not a restaurant.'], ['しちゃく して も いい ですか', 'May I try it on?', 0, 'Not a shop.']] },
    { ctx: 'His answer:', npc: ['にじゅっぷん ぐらい です', 'About 20 minutes.'], ch: [['わかりました', 'I see', 1], ['にふん です ね', '2 minutes, right?', 0, 'にじゅっぷん = 20 minutes.'], ['いいえ', 'No', 0, 'Just acknowledge.']] },
    { ctx: 'You see your hotel ahead.', npc: ['もう すぐ です', 'Almost there.'], ch: [['ここ で とめて ください', 'Please stop here', 1], ['まっすぐ いって ください', 'Please go straight', 1], ['かんぱい', 'Cheers', 0, 'Not now.']] },
    { ctx: 'The fare.', npc: ['せん ろっぴゃく えん です', 'That’s 1,600 yen.'], ch: [['カード で いい ですか', 'Is card okay?', 1], ['せん えん です ね', '1,000 yen, right?', 0, 'ろっぴゃく = 600. 1,600 yen.'], ['たかい です ね', 'Expensive!', 0, 'Be polite.']] },
  ] },
  pharmacy: { title: 'At the pharmacy', place: 'Pharmacy, Osaka', steps: [
    { ctx: 'You have a headache. The pharmacist asks:', npc: ['どう しましたか', 'What’s wrong?'], ch: [['あたま が いたい です', 'I have a headache', 1], ['おなか が いたい です', 'My stomach hurts', 0, 'It is your head: あたま.'], ['おいしい です', 'It’s delicious', 0, 'Not food.']] },
    { ctx: 'You feel a bit hot.', npc: ['ねつ は ありますか', 'Do you have a fever?'], ch: [['すこし あります', 'A little', 1], ['ねつ が あります', 'I have a fever', 1], ['えいご は はなせますか', 'Do you speak English?', 1]] },
    { ctx: 'Allergies?', npc: ['アレルギー は ありますか', 'Any allergies?'], ch: [['いいえ ありません', 'No, none', 1], ['アレルギー が あります', 'I have an allergy', 1], ['くすり を ください', 'Medicine, please', 0, 'Answer the allergy question first.']] },
    { ctx: 'She gives you medicine and instructions.', npc: ['いちにち さんかい のんで ください', 'Take it three times a day.'], ch: [['いちにち さんかい です ね', 'Three times a day, right?', 1], ['いちにち にかい です ね', 'Twice a day, right?', 0, 'さんかい = three times.'], ['かんぱい', 'Cheers', 0, 'Not a drink.']] },
    { ctx: 'She nods.', npc: ['はい。 おだいじ に', 'Yes. Take care of yourself.'], ch: [['ありがとう ございます', 'Thank you very much', 1], ['いただきます', 'Said before eating', 0, 'Say thank you.'], ['また ね', 'See you', 0, 'A bit too casual here.']] },
  ] },
  friend: { title: 'Making a friend', place: 'Live music bar, Shimokitazawa', steps: [
    { ctx: 'Someone near you smiles after the song.', npc: ['いい うた です ね', 'Great song, right?'], ch: [['はい すごい です ね', 'Yes, amazing', 1], ['わかりません', 'I don’t understand', 0, 'うた = song. Agree with them!'], ['ごめんなさい', 'I’m sorry', 0, 'Nothing to be sorry about.']] },
    { ctx: 'They introduce themselves.', npc: ['はじめまして。 けんた です', 'Nice to meet you. I’m Kenta.'], ch: [['はじめまして。 シヴァンシュ です', 'Nice to meet you. I’m Shivanshu.', 1], ['けんた は どこ ですか', 'Where is Kenta?', 0, 'He is Kenta!'], ['さようなら', 'Goodbye', 0, 'You just met.']] },
    { ctx: 'He notices your guitar pick necklace.', npc: ['ギター を ひきますか', 'Do you play guitar?'], ch: [['はい すこし ひきます', 'Yes, a little', 1], ['ギター を ください', 'A guitar, please', 0, 'He asked if you play.'], ['いくら ですか', 'How much?', 0, 'He asked if you play.']] },
    { ctx: 'He invites you.', npc: ['こんど いっしょ に のみ に いきませんか', 'Want to go for a drink sometime?'], ch: [['いい です ね', 'Sounds good', 1], ['ざんねん です が ちょっと', 'Sorry, I can’t', 1], ['たすけて', 'Help!', 0, 'No emergency here.']] },
    { ctx: 'To stay in touch:', npc: ['ライン を こうかん しませんか', 'Shall we swap LINE?'], ch: [['はい ぜひ', 'Yes, definitely', 1], ['いいえ たべません', 'No, I don’t eat it', 0, 'LINE is a messaging app.'], ['チェックイン おねがいします', 'Check-in, please', 0, 'Not a hotel.']] },
    { ctx: 'The night ends.', npc: ['きょう は たのしかった です', 'Today was fun.'], ch: [['わたし も。 また あいましょう', 'Me too. Let’s meet again.', 1], ['ごちそうさま でした', 'Thanks for the meal', 0, 'It was not a meal.'], ['いらっしゃいませ', 'Welcome', 0, 'Staff say that.']] },
  ] },
  reserve: { title: 'Booking a table', place: 'Phone call to a restaurant', steps: [
    { ctx: 'The restaurant answers the phone.', npc: ['はい さくら レストラン です', 'Hello, Sakura Restaurant.'], ch: [['よやく を したい です', 'I’d like to make a reservation', 1], ['いらっしゃいませ', 'Welcome', 0, 'Staff say this.'], ['メニュー を ください', 'The menu, please', 0, 'You are on the phone.']] },
    { ctx: 'How many?', npc: ['なんめいさま ですか', 'For how many people?'], ch: [['ふたり です', 'Two people', 1], ['ふたつ です', 'Two (things)', 0, 'Use ふたり for people.'], ['にじ です', '2 o’clock', 0, 'They asked how many people.']] },
    { ctx: 'What time?', npc: ['なんじ が よろしい ですか', 'What time would you like?'], ch: [['しちじ に おねがいします', 'At seven, please', 1], ['なんじ まで ですか', 'Until what time?', 0, 'Give a time.'], ['しちにん です', 'Seven people', 0, 'Give a time.']] },
    { ctx: 'Listen carefully.', npc: ['もうしわけ ありません。 しちじ は まんせき です。 はちじ は いかが ですか', 'Sorry, seven is full. How about eight?'], ch: [['はちじ で だいじょうぶ です', 'Eight is fine', 1], ['ざんねん です が ちょっと', 'Sorry, that doesn’t work', 1], ['しちじ で おねがいします', 'Seven, please', 0, 'まんせき = fully booked at seven.']] },
    { ctx: 'Your name?', npc: ['おなまえ を おねがいします', 'Your name, please.'], ch: [['シヴァンシュ です', 'It’s Shivanshu', 1], ['インド から きました', 'I came from India', 0, 'Give your name.'], ['はい', 'Yes', 0, 'Give your name.']] },
    { ctx: 'They confirm.', npc: ['おまち して おります', 'We look forward to seeing you.'], ch: [['ありがとう ございます。 よろしく おねがいします', 'Thank you. See you then.', 1], ['いただきます', 'Said before eating', 0, 'Not yet!'], ['たすけて', 'Help!', 0, 'No emergency.']] },
  ] },
};

const line = (tok, en) => ({ jp: tok.replace(/ /g, ''), tokens: tok.split(' '), ro: romaji(tok.replace(/[。、]/g, '')), en });
export const SCENARIOS = Object.fromEntries(Object.entries(S).map(([id, sc]) => [id, {
  id, title: sc.title, place: sc.place,
  steps: sc.steps.map(st => ({
    ctx: st.ctx,
    npc: line(st.npc[0], st.npc[1]),
    ch: st.ch.map(([t, en, ok, why, go]) => ({ ...line(t, en), ok: !!ok, why: why || '', goto: go })),
  })),
}]));

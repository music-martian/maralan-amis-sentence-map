/** Greetings unit fallback — inlined so file:// works without fetch. */
const GREETINGS = {
  "source": "https://klokah.iformosa.com.tw/sentence/junior/learn/4/2/16/1",
  "dialect": "馬蘭阿美語",
  "unit": "問候道別謝謝",
  "class_id": "16",
  "footer": "Klokah 句型篇國中版 · 馬蘭阿美語 · 問候道別謝謝",
  "sentences": [
    {
      "id": "01",
      "amis": "Ngaʼayho ko miso?",
      "zh": "你好嗎？",
      "en": "How are you?",
      "tokens": [
        {
          "id": "pred",
          "text": "Ngaʼayho",
          "role": "pred",
          "gloss_zh": "好嗎",
          "gloss_en": "good-Q"
        },
        {
          "id": "ko",
          "text": "ko",
          "role": "case",
          "gloss_zh": "主格",
          "gloss_en": "NOM"
        },
        {
          "id": "miso",
          "text": "miso",
          "role": "pronoun",
          "gloss_zh": "你",
          "gloss_en": "you",
          "level": "初級",
          "vocab_cat": "02代名詞、指示詞",
          "vocab_code": "02"
        },
        {
          "id": "q",
          "text": "?",
          "role": "punct",
          "gloss_zh": "",
          "gloss_en": ""
        }
      ],
      "layout": {
        "groups": [
          [
            "pred",
            "ko",
            "miso",
            "q"
          ]
        ],
        "hangs": {},
        "plus_between_groups": false,
        "structure": "述語 Ngaʼayho 為中心；ko 標記主格對象 miso（你）"
      },
      "audio": "https://klokah.tw/extension/sp_junior/sound/4/2sentence/1_1.mp3",
      "audio_exchange": "ex1",
      "audio_primary": true
    },
    {
      "id": "02",
      "amis": "Ngaʼayayto kako, kiso i?",
      "zh": "我很好，你呢？",
      "en": "I’m fine, and you?",
      "tokens": [
        {
          "id": "pred",
          "text": "Ngaʼayayto",
          "role": "pred",
          "gloss_zh": "很好了",
          "gloss_en": "already-good"
        },
        {
          "id": "kako",
          "text": "kako",
          "role": "pronoun",
          "gloss_zh": "我",
          "gloss_en": "I",
          "level": "初級",
          "vocab_cat": "02代名詞、指示詞",
          "vocab_code": "02"
        },
        {
          "id": "comma",
          "text": ",",
          "role": "punct",
          "gloss_zh": "",
          "gloss_en": ""
        },
        {
          "id": "kiso",
          "text": "kiso",
          "role": "pronoun",
          "gloss_zh": "你",
          "gloss_en": "you",
          "level": "初級",
          "vocab_cat": "02代名詞、指示詞",
          "vocab_code": "02"
        },
        {
          "id": "i",
          "text": "i",
          "role": "particle",
          "gloss_zh": "在",
          "gloss_en": "Q-particle",
          "level": "初級",
          "vocab_cat": "36助詞或其他",
          "vocab_code": "36"
        },
        {
          "id": "q",
          "text": "?",
          "role": "punct",
          "gloss_zh": "",
          "gloss_en": ""
        }
      ],
      "layout": {
        "groups": [
          [
            "pred",
            "kako",
            "comma"
          ],
          [
            "kiso",
            "i",
            "q"
          ]
        ],
        "hangs": {},
        "plus_between_groups": true,
        "structure": "兩句以 ＋ 連接：左句 Ngaʼayayto 說明 kako；右句 kiso ＋ 助詞 i"
      },
      "audio": "https://klokah.tw/extension/sp_junior/sound/4/2sentence/1_1.mp3",
      "audio_exchange": "ex1",
      "audio_primary": false
    },
    {
      "id": "03",
      "amis": "Mamaan ngaʼayayto kako, awiday tisowanan.",
      "zh": "我也很好，謝謝你。",
      "en": "I’m fine too, thank you.",
      "tokens": [
        {
          "id": "mamaan",
          "text": "Mamaan",
          "role": "adverb",
          "gloss_zh": "也",
          "gloss_en": "also"
        },
        {
          "id": "pred",
          "text": "ngaʼayayto",
          "role": "pred",
          "gloss_zh": "很好了",
          "gloss_en": "already-good"
        },
        {
          "id": "kako",
          "text": "kako",
          "role": "pronoun",
          "gloss_zh": "我",
          "gloss_en": "I",
          "level": "初級",
          "vocab_cat": "02代名詞、指示詞",
          "vocab_code": "02"
        },
        {
          "id": "comma",
          "text": ",",
          "role": "punct",
          "gloss_zh": "",
          "gloss_en": ""
        },
        {
          "id": "awiday",
          "text": "awiday",
          "role": "pred2",
          "gloss_zh": "謝謝",
          "gloss_en": "thanks"
        },
        {
          "id": "tisowanan",
          "text": "tisowanan",
          "role": "pronoun",
          "gloss_zh": "對你",
          "gloss_en": "to-you"
        },
        {
          "id": "period",
          "text": ".",
          "role": "punct",
          "gloss_zh": "",
          "gloss_en": ""
        }
      ],
      "layout": {
        "groups": [
          [
            "mamaan",
            "pred",
            "kako",
            "comma"
          ],
          [
            "awiday",
            "tisowanan",
            "period"
          ]
        ],
        "hangs": {},
        "plus_between_groups": true,
        "structure": "兩句以 ＋ 連接：Mamaan 修飾述語；awiday 作用於 tisowanan"
      },
      "audio": "https://klokah.tw/extension/sp_junior/sound/4/2sentence/1_1.mp3",
      "audio_exchange": "ex1",
      "audio_primary": false
    },
    {
      "id": "04",
      "amis": "Mamaanay kiso?",
      "zh": "你怎麼啦？",
      "en": "What’s wrong?",
      "tokens": [
        {
          "id": "pred",
          "text": "Mamaanay",
          "role": "pred",
          "gloss_zh": "怎麼了",
          "gloss_en": "what’s-wrong"
        },
        {
          "id": "kiso",
          "text": "kiso",
          "role": "pronoun",
          "gloss_zh": "你",
          "gloss_en": "you",
          "level": "初級",
          "vocab_cat": "02代名詞、指示詞",
          "vocab_code": "02"
        },
        {
          "id": "q",
          "text": "?",
          "role": "punct",
          "gloss_zh": "",
          "gloss_en": ""
        }
      ],
      "layout": {
        "groups": [
          [
            "pred",
            "kiso",
            "q"
          ]
        ],
        "hangs": {},
        "plus_between_groups": false,
        "structure": "述語 Mamaanay 直接說明自由主格代名詞 kiso（無 ko）"
      },
      "audio": "https://klokah.tw/extension/sp_junior/sound/4/2sentence/1_2.mp3",
      "audio_exchange": "ex2",
      "audio_primary": true
    },
    {
      "id": "05",
      "amis": "Adadaay ko mata no mako.",
      "zh": "我的眼睛痛。",
      "en": "My eyes hurt.",
      "tokens": [
        {
          "id": "pred",
          "text": "Adadaay",
          "role": "pred",
          "gloss_zh": "痛",
          "gloss_en": "painful"
        },
        {
          "id": "ko",
          "text": "ko",
          "role": "case",
          "gloss_zh": "主格",
          "gloss_en": "NOM"
        },
        {
          "id": "mata",
          "text": "mata",
          "role": "noun",
          "gloss_zh": "眼睛",
          "gloss_en": "eye",
          "level": "初級",
          "vocab_cat": "06身體部位",
          "vocab_code": "06"
        },
        {
          "id": "no",
          "text": "no",
          "role": "case",
          "gloss_zh": "屬格",
          "gloss_en": "GEN"
        },
        {
          "id": "mako",
          "text": "mako",
          "role": "pronoun",
          "gloss_zh": "我的",
          "gloss_en": "my",
          "level": "初級",
          "vocab_cat": "02代名詞、指示詞",
          "vocab_code": "02"
        },
        {
          "id": "period",
          "text": ".",
          "role": "punct",
          "gloss_zh": "",
          "gloss_en": ""
        }
      ],
      "layout": {
        "groups": [
          [
            "pred",
            "ko",
            "mata",
            "period"
          ]
        ],
        "hangs": {
          "mata": [
            "no",
            "mako"
          ]
        },
        "plus_between_groups": false,
        "structure": "述語 Adadaay 說明 ko＋mata；no＋mako 是 mata 的領屬"
      },
      "audio": "https://klokah.tw/extension/sp_junior/sound/4/2sentence/1_2.mp3",
      "audio_exchange": "ex2",
      "audio_primary": false
    },
    {
      "id": "06",
      "amis": "Adadaay ko fongoh no mako.",
      "zh": "我的頭很痛。",
      "en": "My head hurts.",
      "tokens": [
        {
          "id": "pred",
          "text": "Adadaay",
          "role": "pred",
          "gloss_zh": "痛",
          "gloss_en": "painful"
        },
        {
          "id": "ko",
          "text": "ko",
          "role": "case",
          "gloss_zh": "主格",
          "gloss_en": "NOM"
        },
        {
          "id": "fongoh",
          "text": "fongoh",
          "role": "noun",
          "gloss_zh": "頭",
          "gloss_en": "head",
          "level": "初級",
          "vocab_cat": "06身體部位",
          "vocab_code": "06"
        },
        {
          "id": "no",
          "text": "no",
          "role": "case",
          "gloss_zh": "屬格",
          "gloss_en": "GEN"
        },
        {
          "id": "mako",
          "text": "mako",
          "role": "pronoun",
          "gloss_zh": "我的",
          "gloss_en": "my",
          "level": "初級",
          "vocab_cat": "02代名詞、指示詞",
          "vocab_code": "02"
        },
        {
          "id": "period",
          "text": ".",
          "role": "punct",
          "gloss_zh": "",
          "gloss_en": ""
        }
      ],
      "layout": {
        "groups": [
          [
            "pred",
            "ko",
            "fongoh",
            "period"
          ]
        ],
        "hangs": {
          "fongoh": [
            "no",
            "mako"
          ]
        },
        "plus_between_groups": false,
        "structure": "述語 Adadaay 說明 ko＋fongoh；no＋mako 是 fongoh 的領屬"
      },
      "audio": "https://klokah.tw/extension/sp_junior/sound/4/2sentence/1_3.mp3",
      "audio_exchange": "ex3",
      "audio_primary": true
    },
    {
      "id": "07",
      "amis": "Toratoraw!",
      "zh": "再見了！",
      "en": "Goodbye!",
      "tokens": [
        {
          "id": "pred",
          "text": "Toratoraw",
          "role": "pred",
          "gloss_zh": "再見",
          "gloss_en": "goodbye"
        },
        {
          "id": "excl",
          "text": "!",
          "role": "punct",
          "gloss_zh": "",
          "gloss_en": ""
        }
      ],
      "layout": {
        "groups": [
          [
            "pred",
            "excl"
          ]
        ],
        "hangs": {},
        "plus_between_groups": false,
        "structure": "道別套語 Toratoraw，無額外依附"
      },
      "audio": "https://klokah.tw/extension/sp_junior/sound/4/2sentence/1_4.mp3",
      "audio_exchange": "ex4",
      "audio_primary": true
    }
  ]
};
if (typeof window !== 'undefined') window.GREETINGS = GREETINGS;

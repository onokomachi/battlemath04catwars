/** 単元アプリの効果音の代わり。SANMON はバトル側で効果音を鳴らすので、ここでは鳴らさない（音がだぶらないように） */
const noop = () => {};
export const playCorrect = noop, playClear = noop, playLevelUp = noop, playSoftTry = noop, playWrong = noop, playTap = noop;

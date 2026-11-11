// 시험 전용: 영문 자판 바꾸기(설계 §13 "영문 모드로 친 한글")가 영어 낱말·약어를 한글로 바꾸지 않는지 보는 흔한 영어 낱말·약어 109개.
// 업무·개발 도구에서 팔레트에 칠 만한 낱말이다(M7 최종 검토의 목록 그대로).

export const ENGLISH_WORDS: string[] = (
  'word excel slack email notion zoom teams chrome code bug issue task jira docs sheet deck plan spec review report meeting summary draft memo ' +
  'note todo check log fix merge build deploy release unit case safety risk hazard fault error warning api sql db iso can ecu sil fmea autosar ' +
  'ai gpt git lint mock stub vector matlab simulink coverage branch commit push pull tag version table chart graph image file folder path link ' +
  'open close save load copy paste undo redo find replace search filter sort group list view edit delete insert update query index key value ' +
  'type class method function variable loop array string number boolean null'
).split(' ')

/**
 * 위 목록 중 두벌식으로 바꾸면 완성 음절 두 개가 되는 낱말(slack→님차, todo→새애, check→촏차, risk→갸나, query→볃교).
 * 바꾼 글만으로는 한글과 가릴 수 없어 바꾸기를 유지한다(지금 기본 자료에서는 M4에 없는 줄을 더하지 않는다).
 */
export const ENGLISH_WORDS_STILL_CONVERTED = ['slack', 'todo', 'check', 'risk', 'query']

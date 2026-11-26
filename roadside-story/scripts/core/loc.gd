extends Node
## 다국어 지원 (autoload: Loc).
## 콘텐츠 데이터는 "name"(기본 한국어)과 선택적 "name_en" 같은 접미사 필드를 가진다.
## UI 고정 문구는 data/locale/<lang>.json 에서 찾고, 없으면 키(한국어 원문)를 그대로 쓴다.

var lang := "ko"
var _table: Dictionary = {}

func set_lang(code: String) -> void:
	lang = code
	_table = {}
	var path := "res://data/locale/%s.json" % code
	if code != "ko" and FileAccess.file_exists(path):
		var parsed: Variant = JSON.parse_string(FileAccess.get_file_as_string(path))
		if parsed is Dictionary:
			_table = parsed

## UI 문구. 한국어 원문이 곧 키다.
func t(text: String) -> String:
	return _table.get(text, text)

## 콘텐츠 정의에서 현재 언어의 필드를 꺼낸다.
func c(def: Dictionary, field: String = "name") -> String:
	if lang != "ko":
		var k := field + "_" + lang
		if def.has(k):
			return def[k]
	return def.get(field, "")

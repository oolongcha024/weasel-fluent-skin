// Local adapter for rectangle operations, fixed text metrics and JSON I/O.
// Hash-verified upstream DoLayout bodies are inserted at the marker below.
#include <algorithm>
#include <cmath>
#include <iostream>
#include <string>
#include <vector>
using namespace std;
using CDCHandle = int;
constexpr int MAX_CANDIDATES_COUNT = 100, STATUS_ICON_SIZE = 32;

struct CSize {
  int cx = 0, cy = 0;
  CSize(int x = 0, int y = 0) : cx(x), cy(y) {}
  void SetSize(int x, int y) { cx = x; cy = y; }
};
struct CRect {
  int left = 0, top = 0, right = 0, bottom = 0;
  void SetRect(int x, int y, int r, int b) {
    left = x; top = y; right = r; bottom = b;
  }
  int Width() { return right - left; }
  int Height() { return bottom - top; }
  void OffsetRect(int x, int y) { left += x; right += x; top += y; bottom += y; }
  void DeflateRect(int x, int y) { left += x; right -= x; top += y; bottom -= y; }
};
void CopyRect(CRect& target, const CRect& source) { target = source; }
struct Text { wstring str; };
struct Context { Text preedit, aux; };
struct UIStyle {
  enum { ALIGN_TOP, ALIGN_CENTER, ALIGN_BOTTOM };
  int min_width = 0, min_height = 0, max_width = 0, max_height = 0, border = 0;
  int spacing = 0, candidate_spacing = 0, hilite_spacing = 0;
  int hilite_padding_x = 0, hilite_padding_y = 0, round_corner = 0;
  int shadow_radius = 0, shadow_offset_x = 0, shadow_offset_y = 0;
  int align_type = 0, linespacing = 0, baseline = 0;
  bool vertical_text_left_to_right = false, vertical_text_with_wrap = false;
  bool inline_preedit = true;
  unsigned hilited_mark_color = 0, prevpage_color = 0, nextpage_color = 0;
  unsigned comment_text_color = 0xff000000, hilited_comment_text_color = 0xff000000;
  wstring mark_text, label_text_format;
};
struct DWR {
  int pTextFormat = 0, pLabelTextFormat = 1, pCommentTextFormat = 2;
  int pPreeditTextFormat = 0;
};
using PDWR = DWR*;
struct Round {
  bool Hemispherical = false, IsBottomLeftNeedToRound = true;
  bool IsTopRightNeedToRound = true, IsTopLeftNeedToRound = true;
  bool IsBottomRightNeedToRound = true;
};
struct Base {
  UIStyle _style;
  Context _context;
  vector<Text> candidates, labels, comments;
  int candidates_count = 0, id = 0, labelFontValid = 1;
  int textFontValid = 1, cmtFontValid = 1, real_margin_x = 0, real_margin_y = 0;
  int offsetX = 0, offsetY = 0, mark_width = 4, mark_height = 0, mark_gap = 8;
  int measurements[3][2] = {{16, 20}, {6, 14}, {8, 12}};
  CRect _candidateRects[100], _candidateLabelRects[100];
  CRect _candidateTextRects[100], _candidateCommentRects[100];
  CRect _preeditRect, _auxiliaryRect, _highlightRect, _contentRect, _bgRect;
  CRect _prePageRect, _nextPageRect;
  CSize _contentSize;
  Round _roundInfo[100];
  wstring pre = L"<", next = L">";

  bool IsInlinePreedit() { return _style.inline_preedit; }
  bool ShouldDisplayStatusIcon() { return false; }
  void UpdateStatusIconLayout(int*, int*) {}
  void _PrepareRoundInfo(int&) {}
  wstring GetLabelText(vector<Text>& values, int index, const wchar_t*) {
    return values[index].str;
  }
  void GetTextSizeDW(const wstring& text, int, int role, PDWR, CSize* out) {
    if ((role == 1 && !labelFontValid) || (role == 2 && !cmtFontValid)) {
      out->SetSize(0, 0);
      return;
    }
    int width = measurements[role][0], height = measurements[role][1];
    out->SetSize(text.size() * width, height);
  }
  CSize GetPreeditSize(int, Text& text, int role, PDWR resources) {
    CSize size;
    GetTextSizeDW(text.str, text.str.size(), role, resources, &size);
    return size;
  }
};
struct HorizontalLayout : Base { void DoLayout(int, PDWR); };
struct VerticalLayout : Base { void DoLayout(int, PDWR); };
struct VHorizontalLayout : Base {
  void DoLayout(int, PDWR);
  void DoLayoutWithWrap(int, PDWR);
};

// INSERT_NATIVE_LAYOUTS

void rectangle(CRect rect, int x, int y) {
  cout << "[" << rect.left - x << "," << rect.top - y << ","
       << rect.Width() << "," << rect.Height() << "]";
}
wstring field(const string& value) {
  return value == "-" ? L"" : wstring(value.begin(), value.end());
}
void readCase(Base& base) {
  auto& style = base._style;
  cin >> base.candidates_count >> base.id >> style.inline_preedit
      >> style.vertical_text_left_to_right >> style.vertical_text_with_wrap
      >> base.labelFontValid >> base.cmtFontValid
      >> base.real_margin_x >> base.real_margin_y
      >> style.spacing >> style.candidate_spacing >> style.hilite_spacing
      >> style.hilite_padding_x >> style.hilite_padding_y
      >> style.min_width >> style.min_height >> style.max_width >> style.max_height
      >> style.border >> style.shadow_radius >> style.shadow_offset_x
      >> style.shadow_offset_y >> style.align_type >> style.linespacing >> style.baseline;
  for (auto& metric : base.measurements) cin >> metric[0] >> metric[1];
  int mark, page;
  string preedit;
  cin >> mark >> page >> preedit;
  style.hilited_mark_color = mark ? 0xff000000 : 0;
  style.prevpage_color = style.nextpage_color = page ? 0xff000000 : 0;
  base._context.preedit.str = field(preedit);
  // Layout's constructor offsets; actual arrangement uses upstream DoLayout.
  base.offsetX = base.offsetY = style.shadow_radius
      ? 2 * style.shadow_radius - ((style.shadow_offset_x || style.shadow_offset_y)
          ? style.shadow_radius / 2 : 0) : 0;
  if (style.shadow_radius) {
    base.offsetX += abs(style.shadow_offset_x);
    base.offsetY += abs(style.shadow_offset_y);
  }
  base.offsetX += 2 * style.border;
  base.offsetY += 2 * style.border;
  for (int i = 0; i < base.candidates_count; i++) {
    string label, text, comment;
    cin >> label >> text >> comment;
    base.labels.push_back({field(label)});
    base.candidates.push_back({field(text)});
    base.comments.push_back({field(comment)});
  }
}
void writeCase(Base& base) {
  cout << "{\"width\":" << base._contentRect.Width()
       << ",\"height\":" << base._contentRect.Height() << ",\"preedit\":";
  rectangle(base._preeditRect, base.offsetX, base.offsetY);
  cout << ",\"candidates\":[";
  for (int i = 0; i < base.candidates_count; i++) {
    if (i) cout << ",";
    cout << "{\"bounds\":";
    rectangle(base._candidateRects[i], base.offsetX, base.offsetY);
    cout << ",\"label\":";
    rectangle(base._candidateLabelRects[i], base.offsetX, base.offsetY);
    cout << ",\"text\":";
    rectangle(base._candidateTextRects[i], base.offsetX, base.offsetY);
    cout << ",\"comment\":";
    rectangle(base._candidateCommentRects[i], base.offsetX, base.offsetY);
    cout << "}";
  }
  cout << "]}" << endl;
}
int main() {
  int type;
  while (cin >> type) {
    HorizontalLayout horizontal;
    VerticalLayout vertical;
    VHorizontalLayout verticalText;
    Base* base = type == 0 ? static_cast<Base*>(&horizontal)
        : type == 1 ? static_cast<Base*>(&vertical) : static_cast<Base*>(&verticalText);
    readCase(*base);
    DWR resources;
    if (type == 0) horizontal.DoLayout(0, &resources);
    else if (type == 1) vertical.DoLayout(0, &resources);
    else verticalText.DoLayout(0, &resources);
    writeCase(*base);
  }
}

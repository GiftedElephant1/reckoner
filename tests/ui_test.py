"""Drives the built app in headless Chromium at iPhone size and checks what a person would see.

    python3 tests/ui_test.py [screenshot-dir]
"""
import json, os, re, sys, time
from playwright.sync_api import sync_playwright

OUT = sys.argv[1] if len(sys.argv) > 1 else os.path.join(os.path.dirname(__file__), 'shots')
os.makedirs(OUT, exist_ok=True)
URL = 'file://' + os.path.abspath(os.path.join(os.path.dirname(__file__), '..', 'dist', 'index.html'))

passed, failures = 0, []
MINUS = '−'


def check(cond, label, detail=''):
    global passed
    if cond:
        passed += 1
    else:
        failures.append(label + (' :: ' + str(detail) if detail != '' else ''))
        print('FAIL', label, detail)


def eq(actual, expected, label):
    check(actual == expected, label, 'expected %r, got %r' % (expected, actual))


class App:
    def __init__(self, page):
        self.page = page
        self.errors = []
        page.on('console', lambda m: self.errors.append(m.text) if m.type == 'error' else None)
        page.on('pageerror', lambda e: self.errors.append('PAGEERROR ' + str(e)))

    def shot(self, name):
        self.page.screenshot(path=os.path.join(OUT, name + '.png'))

    def key(self, k):
        self.page.locator('#pad [data-k="%s"]' % k).click()

    def keys(self, text):
        """'5.73*458/27' -> key presses on the number pad."""
        for ch in text:
            if ch.isdigit():
                self.key('d:' + ch)
            elif ch == '.':
                self.key('dot')
            elif ch in '+-*/':
                self.key('op:' + ch)
            elif ch == '(':
                self.key('lp')
            elif ch == ')':
                self.key('rp')
            elif ch == '<':
                self.key('back')
            elif ch == '=':
                self.key('enter')
            elif ch == '~':
                self.key('sign')
            elif ch == ',':
                self.key('sep')
            else:
                raise ValueError(ch)

    def letters(self, text):
        for ch in text:
            self.key('ch:' + ch.lower())

    def rows(self):
        return self.page.evaluate("""() => Array.from(document.querySelectorAll('#fields .row')).map(r => ({
            id: r.getAttribute('data-id'),
            sym: (r.querySelector('.sym') || {}).textContent || '',
            desc: (r.querySelector('.desc') || {}).textContent || '',
            num: (r.querySelector('.num') || {}).textContent || '',
            pre: (r.querySelector('.pre') || {}).textContent || '',
            suf: (r.querySelector('.suf') || {}).textContent || '',
            cls: r.className }))""")

    def syms(self):
        return [r['sym'] for r in self.rows()]

    def nums(self):
        return {r['sym']: r['num'] for r in self.rows()}

    def row(self, sym):
        for r in self.rows():
            if r['sym'] == sym:
                return r
        return None

    def row_box(self, sym):
        rid = self.row(sym)['id']
        loc = self.page.locator('#fields .row[data-id="%s"] .row-main' % rid)
        loc.scroll_into_view_if_needed()
        return loc.bounding_box()

    def tap_value(self, sym):
        b = self.row_box(sym)
        self.page.mouse.click(b['x'] + b['width'] - 40, b['y'] + b['height'] / 2)

    def tap_label(self, sym):
        b = self.row_box(sym)
        self.page.mouse.click(b['x'] + 60, b['y'] + b['height'] / 2)

    def double_tap_value(self, sym):
        b = self.row_box(sym)
        self.page.mouse.dblclick(b['x'] + b['width'] - 40, b['y'] + b['height'] / 2)

    def swipe_left(self, sym, dist=140):
        b = self.row_box(sym)
        x, y = b['x'] + b['width'] - 30, b['y'] + b['height'] / 2
        self.page.mouse.move(x, y)
        self.page.mouse.down()
        for i in range(1, 11):
            self.page.mouse.move(x - dist * i / 10, y)
        self.page.mouse.up()

    def expr(self):
        return self.page.evaluate("() => Array.from(document.querySelectorAll('#entry .tk')).map(t => { const l = t.querySelector('.lbl'); return (l ? '[' + l.textContent + ']' : '') + (l ? t.textContent.slice(l.textContent.length) : t.textContent); }).join(' ')")

    def result(self):
        el = self.page.locator('#entry .res')
        return el.inner_text().strip() if el.count() else None

    def enabled(self, k):
        return self.page.locator('#pad [data-k="%s"]' % k).is_enabled()

    def toast(self):
        return self.page.locator('#toast.show span').inner_text() if self.page.locator('#toast.show').count() else ''

    def letters_pad(self):
        self.page.locator('#bar .ib.mode').click()

    def panel_title(self):
        loc = self.page.locator('.ovl.open .panel-title')
        return loc.last.inner_text() if loc.count() else ''

    def close_panel(self):
        self.page.locator('.ovl.open .panel-head .tbtn').last.click()
        self.page.wait_for_timeout(350)

    def js(self, code):
        return self.page.evaluate(code)

    def new_blank(self, name='New sheet'):
        self.js("() => { Reckoner.test.newBlank(%s); }" % json.dumps(name))
        self.page.wait_for_timeout(50)


def run():
    with sync_playwright() as p:
        browser = p.chromium.launch()
        ctx = browser.new_context(viewport={'width': 390, 'height': 844}, device_scale_factor=2, is_mobile=True, has_touch=True, color_scheme='light', locale='en-US')
        page = ctx.new_page()
        app = App(page)
        page.goto(URL)
        page.wait_for_selector('#fields .row')

        # ---------------------------------------------------------------- first run
        eq(page.locator('.head .title').inner_text(), 'Tip and split', 'first run opens the example sheet')
        check(page.locator('#fields .note').count() == 1, 'the example note is shown')
        eq(app.nums(), {'b': '86.4', 't': '18', 'n': '4', 'T': '15.55', 'G': '101.95', 'E': '25.49'}, 'example values')
        check(not app.enabled('enter'), 'the yellow key is off with nothing typed')
        check(not app.enabled('op:+'), 'plus is off with nothing typed')
        check(app.enabled('op:-'), 'minus is available for a negative number')
        check(app.enabled('link'), 'the chain key is on when there are rows')

        # change a number in the example
        app.tap_value('b')
        check('sel' in app.row('b')['cls'], 'tapping a number selects its row')
        app.keys('120')
        eq(app.row('b')['num'], '120', 'typing replaces the number')
        eq(app.nums()['E'], '35.40', 'the results follow while typing')
        app.shot('01-edit-value')
        app.key('back')
        eq(app.row('b')['num'], '12', 'delete removes a digit')
        app.keys('5.5')
        eq(app.nums()['T'], '22.59', 'decimal typing: 125.5 x 18%')
        app.key('enter')
        check('sel' not in app.row('b')['cls'], 'the yellow key finishes the edit')
        app.tap_value('n')
        app.key('clear')
        eq(app.row('n')['num'], '', 'C empties the number')
        eq(app.nums()['E'], '?', 'a result waits when its number is missing')
        app.keys('5')
        eq(app.nums()['E'], '29.62', 'and returns when it is filled in')
        app.key('enter')

        # ---------------------------------------------------------------- a calculation becomes rows
        app.new_blank('Trip')
        check(page.locator('#fields .empty').count() == 1, 'a blank sheet explains what to do')
        check(not app.enabled('link'), 'the chain key is off in an empty sheet')
        app.shot('02-blank')
        app.keys('5.73*458/27')
        eq(app.expr(), '5.73 × 458 ÷ 27', 'the calculation shows as typed')
        eq(app.result(), '97.2', 'live result')
        check(page.locator('#entry .res-note').inner_text().strip().startswith('97.19777'), 'the full value is shown small')
        app.shot('03-typing')
        app.key('enter')
        eq(app.syms(), ['a', 'b', 'c', 'x'], 'three numbers and a result')
        eq(app.nums(), {'a': '5.73', 'b': '458', 'c': '27', 'x': '97.2'}, 'their values')
        eq(app.row('x')['desc'], 'a × b ÷ c', 'an unnamed result shows its formula')
        check('out' in app.row('x')['cls'] and 'in' in app.row('a')['cls'].split(), 'rows are marked as number or result')
        check(page.locator('#entry').is_hidden(), 'the calculation card closes')

        app.keys('34*2+')
        eq(app.expr(), '( 34 × 2 ) +', 'brackets appear when the operator rank changes')
        app.key('link')
        check(page.locator('#pad .padnote').count() == 1, 'the keypad asks for a row')
        app.shot('04-linking')
        app.tap_value('x')
        eq(app.expr(), '( 34 × 2 ) + [x]97.2', 'the linked row shows its value and symbol')
        eq(app.result(), '165.2', 'live result with a link')
        app.shot('05-linked')
        app.key('enter')
        eq(app.syms(), ['a', 'b', 'c', 'x', 'd', 'e', 'y'], 'the second calculation adds d, e and y')
        app.tap_value('b')
        app.keys('523')
        app.key('enter')
        eq((app.nums()['x'], app.nums()['y']), ('110.99', '178.99'), 'changing b updates both results')

        # see and edit a formula
        app.tap_value('y')
        check(page.locator('#fields .peek').count() == 1, 'tapping a result opens a strip under it')
        check(page.locator('#fields .peek .exact').inner_text().startswith('Unrounded 178.99222'), 'a rounded result shows its unrounded value', page.locator('#fields .peek').inner_text())
        check('(d × e) + x' not in page.locator('#fields .peek').inner_text(), 'an unnamed result does not repeat its formula')
        eq(page.locator('#fields .peek .chip').all_inner_texts(), ['Name', 'Edit formula'], 'with shortcuts to name it or edit the formula')
        app.shot('06-peek')
        app.double_tap_value('y')
        check(page.locator('#entry').is_visible(), 'tapping twice opens the formula')
        eq(app.expr(), '( [d]34 × [e]2 ) + [x]110.99', 'the formula shows values with their symbols')
        app.keys('*2')
        eq(app.expr(), '( ( [d]34 × [e]2 ) + [x]110.99 ) × 2', 'editing continues the formula')
        app.key('enter')
        eq(app.syms(), ['a', 'b', 'c', 'x', 'd', 'e', 'f', 'y'], 'the new number becomes a row above the result')
        eq(app.nums()['y'], '357.98', 'the edited result')
        app.double_tap_value('y')
        page.locator('#entry .cap .chip').click()
        check(page.locator('#entry').is_hidden(), 'cancel leaves the formula alone')
        eq(app.nums()['y'], '357.98', 'and the result unchanged')

        # start from a row: tap it, then an operator
        app.tap_value('x')
        app.key('op:*')
        eq(app.expr(), '[x]110.99 ×', 'an operator after selecting a row starts a calculation with it')
        app.keys('3')
        eq(app.result(), '332.98', 'live result from a selected row')
        app.key('clear')
        app.key('clear')
        check(page.locator('#entry').is_hidden(), 'C twice closes the card')

        # ---------------------------------------------------------------- name a row
        app.tap_label('a')
        page.wait_for_timeout(350)
        eq(app.panel_title(), 'Row details', 'tapping the left of a row opens its details')
        check(page.evaluate("() => document.activeElement && document.activeElement.id") == 'prop-desc', 'an unnamed row is ready for its name')
        page.fill('#prop-desc', 'Gas price per gallon')
        page.fill('#prop-prefix', '$')
        eq(page.locator('.preview .desc').inner_text(), 'Gas price per gallon', 'the preview follows the name')
        eq(page.evaluate("() => [document.getElementById('app').scrollTop, window.scrollY]"), [0, 0], 'focusing a field does not shift the app')
        head = page.locator('.ovl.open .panel-head').bounding_box()
        check(head['y'] >= 0, 'the panel title stays on screen', head)
        app.shot('07-details')
        page.fill('#prop-symbol', 'b')
        check('already used' in page.locator('.hint.bad').inner_text(), 'a symbol in use is refused with a reason')
        page.fill('#prop-symbol', 'gas')
        check(page.locator('.hint.bad').count() == 0, 'a free symbol is accepted')
        app.close_panel()
        r = app.row('gas')
        eq((r['desc'], r['pre'], r['num']), ('Gas price per gallon', '$', '5.73'), 'the row shows its name and prefix')
        eq(app.row('x')['desc'], 'gas × b ÷ c', 'formulas follow the renamed symbol')

        # decimals
        app.tap_label('x')
        page.wait_for_timeout(350)
        page.locator('.step button[aria-label="More decimals at least"]').click()
        page.locator('.step button[aria-label="More decimals at least"]').click()
        page.locator('.step button[aria-label="Fewer decimals at most"]').click()
        eq(page.locator('.preview .val').inner_text().strip(), '111.0', 'at most 1 decimal pulls the minimum down with it')
        page.locator('.seg button', has_text='Round up').click()
        eq(page.locator('.preview .val').inner_text().strip(), '111.0', 'rounding up 110.99 at one decimal')
        page.locator('.seg button', has_text='Round down').click()
        eq(page.locator('.preview .val').inner_text().strip(), '110.9', 'rounding down')
        page.locator('.quick button', has_text='km').click()
        eq(page.locator('#prop-suffix').input_value(), 'km', 'a quick unit fills the field')
        app.close_panel()
        eq((app.row('x')['num'], app.row('x')['suf']), ('110.9', 'km'), 'the row uses its own decimals and unit')

        # a named result shows its formula when tapped
        app.tap_label('y')
        page.wait_for_timeout(350)
        page.fill('#prop-desc', 'Fuel and tolls')
        app.close_panel()
        app.tap_value('y')
        check(page.locator('#fields .peek .f').inner_text().startswith('= ((d × e) + x) × f'), 'a named result shows its formula when tapped', page.locator('#fields .peek').inner_text())
        eq(page.locator('#fields .peek .chip').all_inner_texts(), ['Edit formula'], 'and only offers to edit it')
        page.wait_for_timeout(450)
        app.tap_value('y')
        check(page.locator('#fields .peek').count() == 0 and page.locator('#entry').is_hidden(), 'a second, unhurried tap closes the strip')

        # ---------------------------------------------------------------- delete without breaking
        check(page.locator('#fields .row-del:visible').count() == 0, 'no Delete button shows until a row is swiped')
        app.swipe_left('d')
        page.wait_for_timeout(300)
        check(page.locator('#fields .row-del:visible').count() == 1, 'swiping a row left uncovers Delete')
        page.locator('#fields .row[data-id="%s"] .row-del' % app.row('d')['id']).click()
        eq(app.syms(), ['gas', 'b', 'c', 'x', 'e', 'f', 'y'], 'swipe then Delete removes the row')
        eq(app.row('y')['desc'], 'Fuel and tolls', 'the result keeps its name')
        eq(app.nums()['y'], '357.98', 'the result is unchanged')
        check('still work' in app.toast(), 'the toast says formulas still work')
        page.wait_for_timeout(300)
        tb, db = page.locator('#toast').bounding_box(), page.locator('.dock').bounding_box()
        check(tb['y'] + tb['height'] <= db['y'] + 1, 'the message sits above the keypad, not over it', (tb, db))
        app.shot('08-deleted')
        page.locator('#toast button').click()
        eq(app.syms(), ['gas', 'b', 'c', 'x', 'd', 'e', 'f', 'y'], 'Undo brings the row back')
        page.wait_for_timeout(300)
        check(not page.locator('#toast').is_visible(), 'the message is gone after Undo')
        app.tap_value('y')
        check(page.locator('#fields .peek .f').inner_text().startswith('= ((d × e) + x) × f'), 'and the formula as it was', page.locator('#fields .peek').inner_text())
        page.wait_for_timeout(450)
        app.tap_value('y')
        app.swipe_left('e', dist=300)
        page.wait_for_timeout(200)
        check(page.locator('#toast.show').count() == 1, 'a full swipe also offers Undo')
        app.key('d:7')
        page.wait_for_timeout(300)
        check(page.locator('#toast.show').count() == 0 and not page.locator('#toast').is_visible(), 'the message leaves when typing starts')
        app.key('clear')
        app.key('clear')
        app.swipe_left('x', dist=300)
        page.wait_for_timeout(200)
        app.tap_value('y')
        check(page.locator('#fields .peek .f').inner_text().startswith('= ((d × 2) + (gas × b ÷ c)) × f'), 'a full swipe deletes; the formulas are written in', page.locator('#fields .peek').inner_text())
        eq(app.nums()['y'], '357.98', 'still the same result')
        page.wait_for_timeout(450)
        app.tap_value('y')
        page.wait_for_timeout(200)

        # a row deleted while a calculation that uses it is still being typed
        app.tap_value('c')
        app.key('op:+')
        eq(app.expr(), '[c]27 +', 'a calculation started from row c')
        page.locator('#sheet .fields-wrap .scrim').click(position={'x': 195, 'y': 20})
        check(page.locator('#entry').is_hidden() and page.locator('#calc-pill').inner_text() == 'c +', 'tapping outside keeps the unfinished calculation in the bar')
        app.swipe_left('c', dist=300)
        page.wait_for_timeout(250)
        check('c' not in app.syms(), 'row c is deleted')
        eq(page.locator('#calc-pill').inner_text(), '27 +', 'its number is written into the unfinished calculation')
        page.locator('#toast button').click()
        page.wait_for_timeout(300)
        check('c' in app.syms() and page.locator('#calc-pill').inner_text() == 'c +', 'Undo restores the row and the calculation', page.locator('#calc-pill').inner_text())
        page.locator('#calc-pill').click()
        app.key('clear')
        app.key('clear')

        # percent, the way a pocket calculator does it
        app.keys('200+10')
        app.key('pct')
        eq(app.expr(), '200 + 10 %', 'the percent key')
        eq(app.result(), '220', '200 + 10% is 220')
        app.key('clear')
        app.key('clear')
        app.tap_value('b')
        app.key('pct')
        eq(app.expr(), '[b]523 %', 'percent after selecting a row starts from that row')
        eq(app.result(), '5.23', 'as a fraction of 100')
        app.key('clear')
        app.key('clear')

        # ---------------------------------------------------------------- formulas with letters
        app.new_blank('Sum to n')
        app.letters_pad()
        check(page.locator('#pad.abc').count() == 1, 'abc shows the letter keys')
        app.letters('n')
        app.key('op:*')
        app.key('lp')
        app.letters('n')
        app.key('op:+')
        app.shot('09-abc')
        app.key('num')
        app.keys('1)/2')
        eq(app.expr(), 'n × ( n + 1 ) ÷ 2', 'a formula with a letter')
        eq(app.result(), '?', 'no answer until n has a value')
        app.key('enter')
        eq(app.syms(), ['n', 'a', 'b', 'x'], 'n, 1 and 2 become rows')
        check('sel' in app.row('n')['cls'], 'the empty row is selected for its number')
        app.keys('48')
        eq(app.nums()['x'], '1,176', 'n = 48 gives 1,176')
        app.shot('10-formula')
        app.key('enter')
        check(page.locator('#fields .row.sel').count() == 0, 'done when no empty rows remain')
        app.swipe_left('a', dist=300)
        page.wait_for_timeout(150)
        app.swipe_left('b', dist=300)
        page.wait_for_timeout(150)
        eq(app.row('x')['desc'], 'n × (n + 1) ÷ 2', 'deleting the constant rows leaves the formula intact')
        eq(app.nums()['x'], '1,176', 'and the answer')
        app.letters_pad()
        app.key('shift')
        app.letters('p')
        app.key('op:*')
        app.letters('r')
        eq(app.expr(), 'P × r', 'shift gives one capital')
        app.key('clear')
        app.key('num')

        # ---------------------------------------------------------------- notes and totals
        app.new_blank('Log')
        for n in ('23', '24.01', '12.5'):
            app.keys(n)
            app.key('enter')
        eq(app.nums(), {'a': '23', 'b': '24.01', 'c': '12.5'}, 'numbers on their own become rows')
        app.key('fn')
        page.wait_for_timeout(350)
        eq(app.panel_title(), 'Functions', 'the function key opens the list')
        app.shot('11-functions')
        page.locator('.ovl.open button', has_text='Total of the rows above').click()
        page.wait_for_timeout(350)
        eq((app.syms(), app.row('x')['desc'], app.nums()['x']), (['a', 'b', 'c', 'x'], 'Total', '59.51'), 'a total is added and named')
        app.keys('8')
        app.key('enter')
        eq(app.syms(), ['a', 'b', 'c', 'd', 'x'], 'a new number lands above the total')
        eq(app.nums()['x'], '67.51', 'and is counted')
        # an average chosen from the list, picking rows one by one
        app.key('fn')
        page.wait_for_timeout(350)
        page.locator('.ovl.open .fbtn', has_text='avg').click()
        page.wait_for_timeout(350)
        eq(app.expr(), 'avg(', 'the function opens its bracket')
        app.key('link')
        check('rows to add up' in page.locator('#pad .padnote b').inner_text(), 'linking inside a total asks for several rows')
        app.tap_value('a')
        app.tap_value('c')
        eq(app.expr(), 'avg( [a]23 , [c]12.5', 'each tap adds a row and a comma')
        page.wait_for_timeout(300)
        page.locator('#pad .padnote .chip', has_text='Done').click()
        eq(app.result(), '17.75', 'the average of the two')
        app.key('enter')
        eq(app.nums()['y'], '17.75', 'the average is added')
        app.shot('12-log')

        # ---------------------------------------------------------------- brackets by hand
        app.new_blank('Brackets')
        check(not app.enabled('rp'), 'the closing bracket is off with nothing typed')
        app.keys('5')
        check(not app.enabled('rp'), 'and with a single number, where a bracket has nowhere to go')
        app.key('clear')
        app.keys('5.73*458/27')
        check(app.enabled('rp'), 'with a finished sum and no open bracket, ) offers to place one')
        app.key('rp')
        eq(app.expr(), '( 5.73 × 458 ÷ 27 )', 'pressing ) with no open bracket starts the bracket helper')
        page.wait_for_timeout(300)
        page.locator('#pad .padnote .chip', has_text='Cancel').click()
        eq(app.expr(), '5.73 × 458 ÷ 27', 'cancel puts the sum back')
        app.key('fn')
        page.wait_for_timeout(350)
        page.locator('.ovl.open button', has_text='Bracket part of the calculation').click()
        page.wait_for_timeout(350)
        eq(app.expr(), '( 5.73 × 458 ÷ 27 )', 'the bracket helper starts around everything')
        page.wait_for_timeout(300)
        page.locator('#pad .padnote button[aria-label="Move the bracket right"]').click()
        eq(app.expr(), '5.73 × ( 458 ÷ 27 )', 'the arrow moves the opening bracket')
        app.shot('13-bracket')
        page.wait_for_timeout(300)
        page.locator('#pad .padnote .chip', has_text='OK').click()
        eq(app.expr(), '5.73 × ( 458 ÷ 27 )', 'OK keeps the brackets')
        eq(app.result(), '97.2', 'same value, bracketed')
        app.key('clear')
        app.keys('(2+3')
        b = page.locator('#pad [data-k="rp"]').bounding_box()
        page.mouse.move(b['x'] + b['width'] / 2, b['y'] + b['height'] / 2)
        page.mouse.down()
        page.wait_for_timeout(650)
        page.mouse.up()
        check(page.locator('#pad .padnote').count() == 1, 'holding ) opens the bracket helper')
        page.wait_for_timeout(300)
        page.locator('#pad .padnote .chip', has_text='Cancel').click()
        eq(app.expr(), '( 2 + 3', 'cancel leaves the calculation as it was')
        app.keys(')*4')
        eq(app.result(), '20', 'typed brackets')
        # tap a number in the calculation and replace it
        page.locator('#entry .tk', has_text='3').click()
        app.keys('8')
        eq(app.expr(), '( 2 + 8 ) × 4', 'tap a number, type, and it is replaced')
        eq(app.result(), '40', 'value after replacing')
        # function applied to what was typed, then the comma key
        app.key('clear')
        app.keys('3.14159')
        app.key('fn')
        page.wait_for_timeout(350)
        page.locator('.ovl.open .fbtn', has_text='round').click()
        page.wait_for_timeout(350)
        eq(page.locator('#pad [data-k="sep"]').count(), 1, 'the bracket key becomes a comma inside a function')
        app.key('sep')
        app.keys('2')
        eq(app.result(), '3.14', 'round to two places')
        app.key('clear')
        app.key('clear')

        # ---------------------------------------------------------------- reorder and delete several
        app.js("() => Reckoner.test.openSheet(Object.values(Reckoner.test.state().sheets).find(s => s.name === 'Log').id)")
        b = app.row_box('a')
        page.mouse.move(b['x'] + 80, b['y'] + 20)
        page.mouse.down()
        page.wait_for_timeout(650)
        page.mouse.up()
        check(page.locator('#fields .grip').count() == 6, 'holding a row opens edit mode with handles')
        check('picked' in app.row('a')['cls'], 'the held row is ticked')
        app.shot('14-edit-rows')
        g = page.locator('#fields .row[data-id="%s"] .grip' % app.row('a')['id']).bounding_box()
        page.mouse.move(g['x'] + g['width'] / 2, g['y'] + g['height'] / 2)
        page.mouse.down()
        for i in range(1, 11):
            page.mouse.move(g['x'] + g['width'] / 2, g['y'] + g['height'] / 2 + i * 15)
        page.mouse.up()
        eq(app.syms()[:3], ['b', 'c', 'a'], 'dragging the handle moves the row down two places')
        app.tap_label('b')
        page.locator('#sheet .top .tbtn.danger').click()
        eq(app.syms(), ['c', 'd', 'x', 'y'], 'the ticked rows are deleted together')
        eq(app.row('y')['desc'], 'avg(23, c)', 'a deleted row leaves its number in the formula')
        page.locator('#sheet .top .tbtn', has_text='Done').click()
        check(page.locator('#pad').is_visible(), 'Done returns to the keypad')

        # ---------------------------------------------------------------- home, folders
        page.locator('#sheet .top .tbtn').first.click()
        check(page.locator('#home').is_visible(), 'back goes to the list of sheets')
        names = page.locator('#home-list .item .name').all_inner_texts()
        check(any(n.startswith('Trip') for n in names) and any(n.startswith('Log') for n in names), 'new sheets are listed', names)
        check(any('357.98' in t for t in page.locator('#home-list .item .meta').all_inner_texts()), 'the list shows each sheet’s last result')
        app.shot('15-home')
        page.locator('.homebar button[aria-label="New folder"]').click()
        page.wait_for_timeout(250)
        page.fill('#prompt-input', 'Work')
        page.locator('.dlg .btn.primary').click()
        page.wait_for_timeout(350)
        check('Work' in ' '.join(page.locator('#home-list .item .name').all_inner_texts()), 'a folder is created')
        # move a sheet into the folder through the hold menu
        item = page.locator('#home-list .item', has_text='Brackets').locator('.item-main')
        ib = item.bounding_box()
        page.mouse.move(ib['x'] + 100, ib['y'] + 20)
        page.mouse.down()
        page.wait_for_timeout(650)
        page.mouse.up()
        page.wait_for_timeout(350)
        eq(app.panel_title(), 'Brackets', 'holding a sheet opens its menu')
        app.shot('16-item-menu')
        page.locator('.ovl.open .menu button', has_text='Move to a folder').click()
        page.wait_for_timeout(500)
        page.locator('.ovl.open .menu button', has_text='Work').click()
        page.wait_for_timeout(400)
        check(page.locator('#home-list .item', has_text='Brackets').count() == 0, 'the sheet leaves the top level')
        page.locator('#home-list .item', has_text='Work').locator('.item-main').click()
        eq(page.locator('#home .head .title').inner_text(), 'Work', 'the folder opens')
        check(page.locator('#home-list .item', has_text='Brackets').count() == 1, 'and holds the sheet')
        page.locator('#home .top .tbtn').first.click()
        # delete a sheet by swiping, then undo
        count_before = page.locator('#home-list .item').count()
        ib = page.locator('#home-list .item', has_text='Sum to n').locator('.item-main').bounding_box()
        page.mouse.move(ib['x'] + ib['width'] - 30, ib['y'] + 20)
        page.mouse.down()
        for i in range(1, 11):
            page.mouse.move(ib['x'] + ib['width'] - 30 - 30 * i, ib['y'] + 20)
        page.mouse.up()
        page.wait_for_timeout(250)
        eq(page.locator('#home-list .item').count(), count_before - 1, 'a full swipe deletes a sheet')
        page.locator('#toast button').click()
        eq(page.locator('#home-list .item').count(), count_before, 'Undo restores it')
        # reorder
        page.locator('#home .top .tbtn', has_text='Reorder').click()
        first = page.locator('#home-list .item .name').first.inner_text()
        g = page.locator('#home-list .item .grip').first.bounding_box()
        page.mouse.move(g['x'] + 20, g['y'] + 20)
        page.mouse.down()
        for i in range(1, 8):
            page.mouse.move(g['x'] + 20, g['y'] + 20 + i * 14)
        page.mouse.up()
        check(page.locator('#home-list .item .name').first.inner_text() != first, 'dragging reorders the list')
        page.locator('#home .top .tbtn', has_text='Done').click()

        # ---------------------------------------------------------------- templates
        page.locator('#new-sheet').click()
        page.wait_for_timeout(350)
        eq(app.panel_title(), 'New sheet', 'New sheet offers a blank sheet and templates')
        app.shot('17-new-sheet')
        page.locator('.ovl.open .menu button', has_text='Loan payment').click()
        page.wait_for_timeout(400)
        eq(page.locator('#sheet .head .title').inner_text(), 'Loan payment', 'a template opens as a sheet')
        eq(app.nums()['M'], '358.12', 'and calculates')
        app.shot('18-template')

        # ---------------------------------------------------------------- settings
        page.locator('#bar .ib').first.click()
        page.wait_for_timeout(350)
        eq(app.panel_title(), 'Loan payment', 'the options button opens the sheet menu')
        app.shot('19-sheet-menu')
        page.locator('.ovl.open .menu button', has_text='Settings').click()
        page.wait_for_timeout(600)
        eq(app.panel_title(), 'Settings', 'settings open')
        app.shot('20-settings')
        page.locator('.ovl.open .seg button', has_text='Dark').click()
        eq(page.evaluate("() => document.documentElement.getAttribute('data-theme')"), 'dark', 'dark appearance is applied')
        app.shot('21-settings-dark')
        page.locator('.ovl.open .seg button', has_text='Automatic').click()
        eq(page.evaluate("() => document.documentElement.getAttribute('data-theme')"), None, 'automatic removes the override')
        page.locator('.ovl.open .seg button', has_text='Symbols only').click()
        page.locator('.ovl.open .seg button', has_text='1.234,5').click()
        app.close_panel()
        eq(app.nums()['T'], '21.487,35', 'the number format changes everywhere')
        eq(page.locator('#pad [data-k="dot"]').inner_text(), ',', 'the decimal key follows the format')
        app.keys('2*3')
        app.key('enter')
        eq(len(app.syms()), 9, 'symbols-only mode adds just the result')
        page.locator('#bar .ib').first.click()
        page.wait_for_timeout(350)
        page.locator('.ovl.open .menu button', has_text='Settings').click()
        page.wait_for_timeout(600)
        page.locator('.ovl.open .seg button', has_text='Numbers and symbols').click()
        page.locator('.ovl.open .seg button', has_text='1,234.5').first.click()
        app.close_panel()

        # ---------------------------------------------------------------- exports
        pdf = app.js("() => { const b = Reckoner.test.buildPDF(); return { head: String.fromCharCode.apply(null, b.subarray(0, 8)), n: b.length, b64: btoa(String.fromCharCode.apply(null, b)) }; }")
        check(pdf['head'].startswith('%PDF-1.4') and pdf['n'] > 1500, 'a PDF is produced', pdf['head'])
        import base64
        with open(os.path.join(OUT, 'export.pdf'), 'wb') as f:
            f.write(base64.b64decode(pdf['b64']))
        csv = app.js("() => Reckoner.test.csv()")
        check('M,Monthly payment,358.122' in csv and '=L * i * (1 + i)^n / ((1 + i)^n - 1)' in csv, 'the CSV has values and formulas', csv[:200])
        with page.expect_download() as dl:
            page.locator('#sheet .top .tbtn[aria-label="Share or export"]').click()
            page.wait_for_timeout(350)
            app.shot('22-share')
            page.locator('.ovl.open .menu button', has_text='CSV').click()
        eq(dl.value.suggested_filename, 'Loan payment.csv', 'CSV downloads with the sheet name')
        with page.expect_download() as dl:
            page.locator('#sheet .top .tbtn[aria-label="Share or export"]').click()
            page.wait_for_timeout(350)
            page.locator('.ovl.open .menu button', has_text='Sheet file').click()
        eq(dl.value.suggested_filename, 'Loan payment.reckoner.json', 'the sheet file downloads')
        sheet_file = os.path.join(OUT, 'loan.reckoner.json')
        dl.value.save_as(sheet_file)
        # a sheet with non-Latin text exports through the image path
        app.new_blank('日本語 🍣')
        app.keys('1200*3')
        app.key('enter')
        pdf2 = app.js("() => { const b = Reckoner.test.buildPDF(); let s = ''; for (let i = 0; i < b.length; i += 8192) s += String.fromCharCode.apply(null, b.subarray(i, i + 8192)); return { n: b.length, b64: btoa(s) }; }")
        check(pdf2['n'] > 20000, 'a sheet in another script exports as page images', pdf2['n'])
        with open(os.path.join(OUT, 'export-cjk.pdf'), 'wb') as f:
            f.write(base64.b64decode(pdf2['b64']))

        # ---------------------------------------------------------------- import, persistence
        page.locator('#sheet .top .tbtn').first.click()
        before = page.locator('#home-list .item').count()
        page.set_input_files('#file-input', sheet_file)
        page.wait_for_timeout(500)
        check(page.locator('#sheet').is_visible() and page.locator('#sheet .head .title').inner_text() == 'Loan payment', 'opening a sheet file adds the sheet and opens it')
        eq(app.nums()['M'], '358.12', 'the imported sheet calculates')
        page.locator('#sheet .top .tbtn').first.click()
        eq(page.locator('#home-list .item').count(), before + 1, 'the imported sheet is listed')
        app.js("() => Reckoner.test.flush()")
        saved = app.js("() => Object.keys(Reckoner.test.state().sheets).length")
        page.reload()
        page.wait_for_selector('#home-list .item')
        eq(app.js("() => Object.keys(Reckoner.test.state().sheets).length"), saved, 'everything is still there after a reload')
        check(page.locator('#home').is_visible(), 'the app reopens where it was left')

        # ---------------------------------------------------------------- keyboard on a computer
        app.new_blank('Typed')
        page.keyboard.type('12*5')
        eq(app.expr(), '12 × 5', 'a hardware keyboard types into the calculation')
        page.keyboard.press('Enter')
        eq(app.nums().get('x'), '60', 'Enter adds it')
        page.keyboard.type('rate*2')
        eq(app.expr(), 'rate × 2', 'letters type symbols')
        page.keyboard.press('Escape')
        page.keyboard.press('Escape')

        # hide the keypad
        page.locator('#bar .ib[aria-label="Hide the keypad"]').click()
        check(page.locator('#pad').is_hidden(), 'the keypad can be hidden')
        app.shot('23-pad-hidden')
        page.locator('#calc-pill').click()
        check(page.locator('#pad').is_visible() and page.locator('#entry').is_visible(), 'tapping Calculate brings it back')
        app.key('clear')

        # ---------------------------------------------------------------- fingers on the keypad
        app.new_blank('Fingers')
        POINTER = """([k, type, id, dx]) => {
            const b = document.querySelector('#pad [data-k="' + k + '"]'), r = b.getBoundingClientRect();
            b.dispatchEvent(new PointerEvent(type, { bubbles: true, cancelable: true, pointerId: id, pointerType: 'touch', isPrimary: id === 11,
                clientX: r.left + r.width / 2 + (dx || 0), clientY: r.top + r.height / 2 }));
        }"""
        def finger(k, kind, pid, dx=0):
            page.evaluate(POINTER, [k, kind, pid, dx])
        # two thumbs: the second key goes down before the first comes up
        finger('d:4', 'pointerdown', 11)
        finger('d:2', 'pointerdown', 12)
        finger('d:4', 'pointerup', 11)
        finger('d:2', 'pointerup', 12)
        eq(app.expr(), '42', 'two overlapping presses both count, in the order the fingers lift')
        # a finger lands on + before the 7 that makes + available has been released
        app.key('clear')
        app.key('clear')
        check(not app.enabled('op:+'), 'plus is off with nothing typed')
        finger('d:7', 'pointerdown', 11)
        finger('op:+', 'pointerdown', 12)
        finger('d:7', 'pointerup', 11)
        finger('op:+', 'pointerup', 12)
        eq(app.expr(), '7 +', 'a key that becomes available while the finger is on it still counts')
        # sliding off a key before lifting cancels the press
        finger('d:9', 'pointerdown', 11)
        finger('d:9', 'pointerup', 11, 80)
        eq(app.expr(), '7 +', 'lifting the finger away from the key cancels it')
        check(page.locator('#pad .key.down').count() == 0, 'no key stays pressed')
        # a real touch: one press, one digit, even though the browser also sends a click
        b9 = page.locator('#pad [data-k="d:9"]').bounding_box()
        page.touchscreen.tap(b9['x'] + b9['width'] / 2, b9['y'] + b9['height'] / 2)
        page.wait_for_timeout(120)
        eq(app.expr(), '7 + 9', 'a tap on the touchscreen types once')
        # the tap that opens a panel must not also dismiss it
        bf = page.locator('#pad [data-k="fn"]').bounding_box()
        page.touchscreen.tap(bf['x'] + bf['width'] / 2, bf['y'] + bf['height'] / 2)
        page.wait_for_timeout(500)
        eq(app.panel_title(), 'Functions', 'a touch on fx opens the functions and they stay open')
        app.close_panel()
        # holding delete repeats, and lifting adds no extra delete
        app.keys('123456')
        eq(app.expr(), '7 + 9,123,456', 'more digits to delete')
        bb = page.locator('#pad [data-k="back"]').bounding_box()
        page.mouse.move(bb['x'] + bb['width'] / 2, bb['y'] + bb['height'] / 2)
        page.mouse.down()
        page.wait_for_timeout(420 + 85 * 3 + 40)
        page.mouse.up()
        held = app.expr()
        check(held in ('7 + 9,123', '7 + 912', '7 + 91,234'), 'holding delete removes several digits', held)
        page.wait_for_timeout(250)
        eq(app.expr(), held, 'and stops when the finger lifts')
        # a script or assistive click with no pointer behind it still works
        page.wait_for_timeout(800)
        page.evaluate("""() => document.querySelector('#pad [data-k="d:5"]').click()""")
        check(app.expr().endswith('5'), 'a click with no pointer behind it still presses the key', app.expr())
        app.key('clear')
        app.key('clear')

        # ---------------------------------------------------------------- touches on rows
        app.keys('6*7')
        app.key('enter')
        eq(app.syms(), ['a', 'b', 'x'], 'three rows to touch')
        # a slow, deliberate press while picking a row is still a tap
        app.keys('2*')
        app.key('link')
        b = app.row_box('a')
        page.mouse.move(b['x'] + b['width'] - 40, b['y'] + b['height'] / 2)
        page.mouse.down()
        page.wait_for_timeout(700)
        page.mouse.up()
        eq(app.expr(), '2 × [a]6', 'a slow press on a row still picks it while linking')
        app.key('clear')
        app.key('clear')
        # which way a touch sets off decides whether the list or the row gets it
        TOUCH = """([dx, dy]) => {
            const el = document.querySelector('#fields .row .row-main'), r = el.getBoundingClientRect();
            const at = (x, y) => new Touch({ identifier: 7, target: el, clientX: x, clientY: y });
            const x0 = r.right - 30, y0 = r.top + r.height / 2;
            el.dispatchEvent(new TouchEvent('touchstart', { bubbles: true, cancelable: true, touches: [at(x0, y0)], changedTouches: [at(x0, y0)] }));
            const move = new TouchEvent('touchmove', { bubbles: true, cancelable: true, touches: [at(x0 + dx, y0 + dy)], changedTouches: [at(x0 + dx, y0 + dy)] });
            el.dispatchEvent(move);
            el.dispatchEvent(new TouchEvent('touchend', { bubbles: true, cancelable: true, touches: [], changedTouches: [at(x0 + dx, y0 + dy)] }));
            return move.defaultPrevented;
        }"""
        eq(page.evaluate(TOUCH, [-12, 2]), True, 'a touch that sets off sideways on a row is kept from scrolling the list')
        eq(page.evaluate(TOUCH, [-3, 12]), False, 'a touch that sets off downwards is left to scroll')
        eq(page.evaluate(TOUCH, [-2, 1]), False, 'a touch that has barely moved is not decided yet')
        # a swipe whose row is redrawn under the finger must not delete anything
        b = app.row_box('b')
        x, y = b['x'] + b['width'] - 30, b['y'] + b['height'] / 2
        page.mouse.move(x, y)
        page.mouse.down()
        for i in range(1, 6):
            page.mouse.move(x - 12 * i, y)
        page.evaluate("() => { const T = Reckoner.test; T.openSheet(T.sheet().id); }")
        page.mouse.move(x - 80, y)
        page.mouse.up()
        page.wait_for_timeout(150)
        eq(app.syms(), ['a', 'b', 'x'], 'a row redrawn in the middle of a swipe is not deleted')
        check(page.locator('#toast.show').count() == 0, 'and nothing is reported as deleted')

        # ---------------------------------------------------------------- a long press and the click that follows it
        page.locator('#sheet .top .tbtn').first.click()
        item = page.locator('#home-list .item', has_text='Fingers').locator('.item-main')
        item.scroll_into_view_if_needed()
        ib = item.bounding_box()
        hx, hy = ib['x'] + 120, ib['y'] + ib['height'] / 2
        page.mouse.move(hx, hy)
        page.mouse.down()
        page.wait_for_timeout(650)
        check(page.locator('.ovl .panel-title').count() == 1, 'holding a sheet opens its menu while the finger is still down')
        # an iPhone aims the click of the lifting finger at whatever is under it by now: here, the menu
        names_before = page.locator('#home-list .item .name').all_inner_texts()
        page.evaluate("""() => { const b = Array.from(document.querySelectorAll('.ovl .menu button')).find(x => /Delete/.test(x.textContent)); b.click(); }""")
        page.mouse.up()
        page.wait_for_timeout(400)
        eq(page.locator('#home-list .item .name').all_inner_texts(), names_before, 'the click from lifting the finger does not press a menu item')
        eq(app.panel_title(), 'Fingers', 'and the menu is still open')
        page.locator('.ovl.open .menu button', has_text='Rename').click()
        page.wait_for_timeout(250)
        check(page.locator('#prompt-input').count() == 1 and page.evaluate("() => document.activeElement.id") == 'prompt-input', 'a real tap on the menu works and the rename box is ready to type in')
        check(page.locator('.ovl.open .dlg').count() == 1, 'the rename box is fully shown at once')
        page.locator('.dlg .btn', has_text='Cancel').click()
        page.wait_for_timeout(350)
        item.scroll_into_view_if_needed()
        item.click()
        check(page.locator('#sheet').is_visible(), 'back in the sheet')

        check(app.errors == [], 'no errors in the console', app.errors)

        # ---------------------------------------------------------------- dark screenshots
        ctx2 = browser.new_context(viewport={'width': 390, 'height': 844}, device_scale_factor=2, is_mobile=True, has_touch=True, color_scheme='dark', locale='en-US')
        p2 = ctx2.new_page()
        a2 = App(p2)
        p2.goto(URL)
        p2.wait_for_selector('#fields .row')
        a2.new_blank('Night')
        a2.keys('1.99-0.26')
        a2.key('enter')
        a2.keys('0-900')
        a2.key('enter')
        a2.shot('30-dark-sheet')
        check('neg' in a2.row('y')['cls'], 'a negative result is marked')
        eq(a2.row('y')['num'], MINUS + '900', 'and uses a true minus sign')
        a2.keys('7*')
        a2.shot('31-dark-typing')
        check(a2.errors == [], 'no errors in dark mode', a2.errors)
        ctx2.close()

        # ---------------------------------------------------------------- small phone and wide window
        ctx3 = browser.new_context(viewport={'width': 320, 'height': 568}, device_scale_factor=2, is_mobile=True, has_touch=True, locale='en-US')
        p3 = ctx3.new_page()
        a3 = App(p3)
        p3.goto(URL)
        p3.wait_for_selector('#fields .row')
        a3.shot('40-small-phone')
        overflow = p3.evaluate("() => document.documentElement.scrollWidth > window.innerWidth + 1")
        check(not overflow, 'nothing overflows sideways on a small phone')
        pad = p3.locator('#pad').bounding_box()
        check(pad['y'] + pad['height'] <= 568 + 1, 'the keypad fits on a small phone', pad)
        ctx3.close()
        ctx4 = browser.new_context(viewport={'width': 1280, 'height': 800}, locale='en-US')
        p4 = ctx4.new_page()
        p4.goto(URL)
        p4.wait_for_selector('#fields .row')
        p4.screenshot(path=os.path.join(OUT, '41-desktop.png'))
        box = p4.locator('#app').bounding_box()
        check(380 < box['width'] < 460 and box['x'] > 300, 'on a wide window the app stays phone-sized and centred', box)
        ctx4.close()

        # ---------------------------------------------------------------- margins handed over by the iPhone app
        ctx5 = browser.new_context(viewport={'width': 393, 'height': 852}, device_scale_factor=2, is_mobile=True, has_touch=True, locale='en-US')
        p5 = ctx5.new_page()
        a5 = App(p5)
        p5.goto(URL)
        p5.wait_for_selector('#fields .row')
        measure = """() => {
          const r = s => document.querySelector(s).getBoundingClientRect();
          const keys = Array.from(document.querySelectorAll('#pad [data-k]')).map(k => k.getBoundingClientRect().bottom);
          return { back: r('#sheet .top button').top, lastKey: Math.max.apply(null, keys), pad: r('#pad').bottom, list: r('#fields').height };
        }"""
        plain = p5.evaluate(measure)
        check(p5.evaluate("() => window.reckonerSetInsets(59, 34)") is True, 'the app can hand its margins to the page')
        inset = p5.evaluate(measure)
        check(inset['back'] >= 59, 'the top bar starts below the status bar', inset)
        check(abs(inset['back'] - plain['back'] - 59) < 1, 'and moves down by exactly that margin', (plain, inset))
        check(inset['lastKey'] <= 852 - 34 + 0.5, 'the keys stay clear of the home indicator', inset)
        check(inset['pad'] <= 852 + 0.5, 'the keypad still ends at the bottom of the screen', inset)
        check(inset['list'] >= 3 * 57, 'at least three rows stay in view', inset)
        a5.keys('12+')
        a5.shot('42-with-margins')
        p5.evaluate("() => window.reckonerSetInsets(59, 0)")
        typing = p5.evaluate(measure)
        check(typing['lastKey'] > inset['lastKey'] + 30, 'with the keyboard up the bottom margin is given back', (inset, typing))
        p5.evaluate("() => window.reckonerSetInsets(-5, 'x')")
        check(abs(p5.evaluate(measure)['back'] - plain['back']) < 1, 'nonsense margins count as none')
        check(a5.errors == [], 'no errors while the margins change', a5.errors)
        ctx5.close()
        browser.close()


run()
print('%d passed, %d failed' % (passed, len(failures)))
for f in failures:
    print('  FAIL ' + f)
sys.exit(1 if failures else 0)

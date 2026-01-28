const COPYRIGHT_NOTICE = `Stackboi  Copyright (C) 2026 0xrohan10
This program comes with ABSOLUTELY NO WARRANTY; for details type 'stackboi license w'.
This is free software, and you are welcome to redistribute it
under certain conditions; type 'stackboi license c' for details.`;

const WARRANTY_DISCLAIMER = `                     DISCLAIMER OF WARRANTY

THERE IS NO WARRANTY FOR THE PROGRAM, TO THE EXTENT PERMITTED BY
APPLICABLE LAW.  EXCEPT WHEN OTHERWISE STATED IN WRITING THE COPYRIGHT
HOLDERS AND/OR OTHER PARTIES PROVIDE THE PROGRAM "AS IS" WITHOUT WARRANTY
OF ANY KIND, EITHER EXPRESSED OR IMPLIED, INCLUDING, BUT NOT LIMITED TO,
THE IMPLIED WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR
PURPOSE.  THE ENTIRE RISK AS TO THE QUALITY AND PERFORMANCE OF THE PROGRAM
IS WITH YOU.  SHOULD THE PROGRAM PROVE DEFECTIVE, YOU ASSUME THE COST OF
ALL NECESSARY SERVICING, REPAIR OR CORRECTION.

                     LIMITATION OF LIABILITY

IN NO EVENT UNLESS REQUIRED BY APPLICABLE LAW OR AGREED TO IN WRITING
WILL ANY COPYRIGHT HOLDER, OR ANY OTHER PARTY WHO MODIFIES AND/OR CONVEYS
THE PROGRAM AS PERMITTED ABOVE, BE LIABLE TO YOU FOR DAMAGES, INCLUDING ANY
GENERAL, SPECIAL, INCIDENTAL OR CONSEQUENTIAL DAMAGES ARISING OUT OF THE
USE OR INABILITY TO USE THE PROGRAM (INCLUDING BUT NOT LIMITED TO LOSS OF
DATA OR DATA BEING RENDERED INACCURATE OR LOSSES SUSTAINED BY YOU OR THIRD
PARTIES OR A FAILURE OF THE PROGRAM TO OPERATE WITH ANY OTHER PROGRAMS),
EVEN IF SUCH HOLDER OR OTHER PARTY HAS BEEN ADVISED OF THE POSSIBILITY OF
SUCH DAMAGES.`;

const CONDITIONS = `                     CONDITIONS FOR REDISTRIBUTION

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU General Public License as published by
the Free Software Foundation, either version 3 of the License, or
(at your option) any later version.

Key conditions for redistribution:

1. You must give any other recipients of the Work a copy of this License.

2. You must cause any modified files to carry prominent notices stating
   that you changed the files and the date of any change.

3. You must keep intact all notices that refer to this License and to
   the disclaimer of warranties.

4. If the Program has interactive user interfaces, each must display
   Appropriate Legal Notices.

5. You may convey the Program in object code form provided that you also
   convey the machine-readable Corresponding Source.

For the complete terms and conditions, see the LICENSE file or visit:
https://www.gnu.org/licenses/gpl-3.0.html`;

export function showCopyrightNotice(): void {
  console.log(COPYRIGHT_NOTICE);
}

export async function showLicense(type?: string): Promise<void> {
  if (type === "w" || type === "warranty") {
    console.log(WARRANTY_DISCLAIMER);
  } else if (type === "c" || type === "conditions") {
    console.log(CONDITIONS);
  } else {
    showCopyrightNotice();
    console.log("\nUsage:");
    console.log("  stackboi license w         Show warranty disclaimer");
    console.log("  stackboi license c         Show redistribution conditions");
  }
}

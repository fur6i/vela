; Save only a language hint. Silent updates leave it untouched.
!include "LogicLib.nsh"
!macro customInstall
  Push $0
  ${IfNot} ${Silent}
    CreateDirectory "$APPDATA\Vela"
    ClearErrors
    FileOpen $0 "$APPDATA\Vela\installer-language.txt" w
    ${If} $0 != ""
      ${If} $LANGUAGE == 1040
        FileWrite $0 "it"
      ${Else}
        FileWrite $0 "en"
      ${EndIf}
      FileClose $0
    ${EndIf}
  ${EndIf}
  Pop $0
!macroend

# Lo que sale de la app hacia un archivo tuyo: la plantilla de Excel para apuntar o pasar movimientos con un desplegable de TUS
# categorías (el importador la reconoce: perfil «Plantilla de FinanceBuddy»). El resumen en HTML se monta en la página
# (web/paneles/exportar.js) porque ahí están ya todas las cuentas; aquí no hace falta tocar nada de eso.
import io
from . import VERSION

def plantilla_excel(alm):
    """Excel (bytes) con una hoja «Movimientos» (Fecha, Concepto, Importe, Categoría con desplegable), otra «Listas» con tus
    categorías y otra con las instrucciones. Importe: negativo = gasto, positivo = ingreso."""
    from openpyxl import Workbook
    from openpyxl.styles import Alignment, Font, PatternFill
    from openpyxl.worksheet.datavalidation import DataValidation
    cats = sorted(alm.todos("categoria"), key=lambda c: (c.get("grupo") == "ingreso", c["nombre"].lower()))
    wb = Workbook()
    ws = wb.active; ws.title = "Movimientos"
    ws.append(["Fecha", "Concepto", "Importe", "Categoría"])
    for c in ws[1]: c.font = Font(bold=True, color="FFFFFF"); c.fill = PatternFill("solid", fgColor="5E8266"); c.alignment = Alignment(vertical="center")
    for col, ancho in zip("ABCD", (14, 42, 14, 24)): ws.column_dimensions[col].width = ancho
    ws.freeze_panes = "A2"
    for r in range(2, 1002):
        ws.cell(r, 1).number_format = "dd/mm/yyyy"; ws.cell(r, 3).number_format = "#,##0.00"
    ls = wb.create_sheet("Listas")
    ls.append(["Categorías"]); ls["A1"].font = Font(bold=True)
    for c in cats: ls.append([c["nombre"]])
    ls.column_dimensions["A"].width = 26
    n = max(2, len(cats) + 1)
    dv = DataValidation(type="list", formula1=f"Listas!$A$2:$A${n}", allow_blank=True, showErrorMessage=True,
                        errorTitle="Categoría", error="Elige una de la lista (las categorías de FinanceBuddy).")
    dv.add("D2:D1001"); ws.add_data_validation(dv)
    dd = DataValidation(type="date", operator="greaterThan", formula1="36526", allow_blank=True, showErrorMessage=True, errorTitle="Fecha", error="Escribe una fecha, por ejemplo 28/09/2026.")
    dd.add("A2:A1001"); ws.add_data_validation(dd)
    di = DataValidation(type="decimal", operator="between", formula1="-100000000", formula2="100000000", allow_blank=True, showErrorMessage=True, errorTitle="Importe", error="Escribe un número: negativo si es un gasto, positivo si es un ingreso.")
    di.add("C2:C1001"); ws.add_data_validation(di)
    ayuda = wb.create_sheet("Cómo se usa")
    for linea in ["Plantilla de FinanceBuddy",
                  "",
                  "1. En la hoja «Movimientos» escribe una fila por movimiento: fecha, concepto, importe y categoría (se elige de la lista).",
                  "2. El importe va con signo: negativo si es un gasto (−12,50) y positivo si es un ingreso o te devuelven dinero (+30).",
                  "3. Guarda el archivo y súbelo en FinanceBuddy → Importar (o déjalo en la carpeta Importar\\Banco).",
                  "4. La primera vez te preguntará en qué cuenta va. Lo que ya estaba importado no se duplica.",
                  "",
                  "No cambies los títulos de la fila 1. La hoja «Listas» tiene tus categorías: si añades una en FinanceBuddy, descarga la plantilla de nuevo.",
                  f"Creada con FinanceBuddy {VERSION}."]:
        ayuda.append([linea])
    ayuda["A1"].font = Font(bold=True, size=14); ayuda.column_dimensions["A"].width = 120
    buf = io.BytesIO(); wb.save(buf)
    return buf.getvalue()

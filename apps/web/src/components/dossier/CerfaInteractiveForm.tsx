import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { getCerfaFieldMapping, type CerfaFormValues, type CerfaFieldValue } from "@/lib/urbanisme/cerfa/cerfaFieldMapping";
import type { CerfaSectionDefinition, CerfaFieldDefinition } from "@/lib/urbanisme/cerfa/cerfaFormSchema";

function valueAsString(value: CerfaFieldValue) {
  if (value === undefined || value === null) return "";
  return String(value);
}

function setFieldValue(
  values: CerfaFormValues,
  field: CerfaFieldDefinition,
  raw: string,
): CerfaFieldValue {
  if (field.type === "yes_no") return raw === "yes";
  if (field.type === "number") return raw === "" ? "" : Number(raw);
  return raw;
}

export function CerfaInteractiveForm(props: {
  section: CerfaSectionDefinition;
  values: CerfaFormValues;
  onValuesChange: (values: CerfaFormValues) => void;
}) {
  const { section, values, onValuesChange } = props;

  const update = (field: CerfaFieldDefinition, raw: string) => {
    onValuesChange({ ...values, [field.id]: setFieldValue(values, field, raw) });
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-semibold text-slate-950">{section.title}</h2>
        <p className="mt-1 text-sm text-slate-600">{section.description}</p>
      </div>

      <div className="grid gap-5">
        {section.fields.map((field) => {
          const mapping = getCerfaFieldMapping(field.id);
          const id = `cerfa-${field.id.replace(/[^a-z0-9]/gi, "-")}`;
          return (
            <div key={field.id} className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
              <div className="mb-2 flex flex-wrap items-start justify-between gap-2">
                <Label htmlFor={id} className="text-sm font-semibold text-slate-900">
                  {field.label}
                  {field.required ? <span className="ml-1 text-red-600">*</span> : null}
                </Label>
                {mapping ? (
                  <Badge variant="outline" className="border-slate-200 bg-slate-50 text-[11px] font-medium text-slate-600">
                    {mapping.cerfaReference}
                  </Badge>
                ) : null}
              </div>

              {field.type === "textarea" ? (
                <Textarea
                  id={id}
                  value={valueAsString(values[field.id])}
                  onChange={(event) => update(field, event.target.value)}
                  placeholder={field.placeholder}
                  className="min-h-28 resize-y"
                />
              ) : field.type === "select" ? (
                <Select value={valueAsString(values[field.id])} onValueChange={(value) => update(field, value)}>
                  <SelectTrigger id={id}>
                    <SelectValue placeholder="Sélectionner" />
                  </SelectTrigger>
                  <SelectContent>
                    {(field.options || []).map((option) => (
                      <SelectItem key={option.value} value={option.value}>
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              ) : field.type === "yes_no" ? (
                <Select
                  value={values[field.id] === true ? "yes" : values[field.id] === false ? "no" : ""}
                  onValueChange={(value) => update(field, value)}
                >
                  <SelectTrigger id={id}>
                    <SelectValue placeholder="À renseigner" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="yes">Oui</SelectItem>
                    <SelectItem value="no">Non</SelectItem>
                  </SelectContent>
                </Select>
              ) : (
                <Input
                  id={id}
                  type={field.type === "number" ? "number" : field.type === "date" ? "date" : "text"}
                  value={valueAsString(values[field.id])}
                  onChange={(event) => update(field, event.target.value)}
                  placeholder={field.placeholder}
                />
              )}

              {field.helpText ? <p className="mt-2 text-xs text-slate-500">{field.helpText}</p> : null}
            </div>
          );
        })}
      </div>
    </div>
  );
}

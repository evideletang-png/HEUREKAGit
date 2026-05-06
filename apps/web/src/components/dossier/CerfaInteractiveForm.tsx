import { useState } from "react";
import { CheckCircle2, Loader2, Search } from "lucide-react";
import { useGeocodeAddress } from "@workspace/api-client-react";
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

function SmartAddressInput(props: {
  id: string;
  value: string;
  placeholder?: string;
  onChange: (value: string) => void;
}) {
  const [selectedLabel, setSelectedLabel] = useState("");
  const geocode = useGeocodeAddress({ q: props.value }, { query: { enabled: props.value.length > 5 && props.value !== selectedLabel } } as any);
  const results = geocode.data?.results || [];

  return (
    <div className="relative">
      <Input
        id={props.id}
        value={props.value}
        onChange={(event) => {
          setSelectedLabel("");
          props.onChange(event.target.value);
        }}
        placeholder={props.placeholder}
        className="pl-10"
        autoComplete="off"
      />
      <Search className="absolute left-3.5 top-3 h-4 w-4 text-slate-500" />
      {geocode.isLoading ? <Loader2 className="absolute right-3.5 top-3 h-4 w-4 animate-spin text-slate-500" /> : null}

      {results.length > 0 && props.value.length > 5 && props.value !== selectedLabel ? (
        <div className="absolute z-30 mt-2 max-h-64 w-full overflow-y-auto rounded-lg border border-slate-200 bg-white shadow-lg">
          {results.map((result: any, index: number) => (
            <button
              key={`${result.id || result.label}-${index}`}
              type="button"
              className="block w-full border-b px-4 py-3 text-left last:border-b-0 hover:bg-slate-50"
              onClick={() => {
                setSelectedLabel(result.label);
                props.onChange(result.label);
              }}
            >
              <span className="block text-sm font-semibold text-slate-950">{result.label}</span>
              <span className="text-xs text-slate-500">{result.city} ({result.postcode})</span>
            </button>
          ))}
        </div>
      ) : null}

      {selectedLabel ? (
        <div className="mt-2 inline-flex items-center gap-1.5 rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-xs font-medium text-emerald-700">
          <CheckCircle2 className="h-3.5 w-3.5" />
          Adresse sélectionnée
        </div>
      ) : null}
    </div>
  );
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

              {field.type === "address" ? (
                <SmartAddressInput
                  id={id}
                  value={valueAsString(values[field.id])}
                  onChange={(value) => update(field, value)}
                  placeholder={field.placeholder}
                />
              ) : field.type === "textarea" ? (
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

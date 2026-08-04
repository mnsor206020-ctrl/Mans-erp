import { useLanguage } from "@/lib/language-provider";
import { useCreateOrganization } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useLocation } from "wouter";
import { ArrowLeft, ArrowRight, Building2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

const orgSchema = z.object({
  nameEn: z.string().min(1, "English name is required"),
  nameAr: z.string().min(1, "Arabic name is required"),
  type: z.string().min(1, "Type is required"),
  registrationNumber: z.string().optional(),
  email: z.string().email("Invalid email").optional().or(z.literal('')),
  phone: z.string().optional(),
  city: z.string().optional(),
});

type OrgFormValues = z.infer<typeof orgSchema>;

export default function NewOrganization() {
  const { t, lang, dir } = useLanguage();
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const createOrg = useCreateOrganization();

  const form = useForm<OrgFormValues>({
    resolver: zodResolver(orgSchema),
    defaultValues: {
      nameEn: "",
      nameAr: "",
      type: "CHARITY",
      registrationNumber: "",
      email: "",
      phone: "",
      city: "",
    },
  });

  const onSubmit = (data: OrgFormValues) => {
    createOrg.mutate({ data }, {
      onSuccess: () => {
        toast({
          title: t('common.success'),
          description: lang === 'ar' ? 'تم إنشاء المنظمة بنجاح' : 'Organization created successfully',
        });
        setLocation('/organizations');
      },
      onError: (err) => {
        toast({
          variant: "destructive",
          title: t('common.error'),
          description: err?.message || 'Failed to create organization',
        });
      }
    });
  };

  return (
    <div className="space-y-6 max-w-3xl mx-auto animate-in fade-in duration-500">
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" onClick={() => setLocation('/organizations')} className="rounded-full hover:bg-muted">
          {dir === 'rtl' ? <ArrowRight className="w-5 h-5" /> : <ArrowLeft className="w-5 h-5" />}
        </Button>
        <div>
          <h2 className="text-2xl font-bold tracking-tight">{t('orgs.new')}</h2>
          <p className="text-muted-foreground text-sm mt-1">
            {lang === 'ar' ? 'أدخل تفاصيل المنظمة الجديدة لضمها للنظام' : 'Enter the details for the new organization'}
          </p>
        </div>
      </div>

      <Card className="shadow-sm border-border/50">
        <CardHeader className="bg-muted/30 border-b border-border/50">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center text-primary">
              <Building2 className="w-5 h-5" />
            </div>
            <div>
              <CardTitle className="text-lg">{lang === 'ar' ? 'المعلومات الأساسية' : 'Basic Information'}</CardTitle>
              <CardDescription>{lang === 'ar' ? 'البيانات الرسمية ومعلومات التواصل' : 'Official details and contact information'}</CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-6">
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <FormField
                  control={form.control}
                  name="nameAr"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t('orgs.nameAr')} <span className="text-destructive">*</span></FormLabel>
                      <FormControl>
                        <Input placeholder="مثال: جمعية البر" dir="rtl" {...field} className="bg-muted/30 focus:bg-background transition-colors" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="nameEn"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t('orgs.nameEn')} <span className="text-destructive">*</span></FormLabel>
                      <FormControl>
                        <Input placeholder="e.g. Al-Bir Charity" dir="ltr" {...field} className="bg-muted/30 focus:bg-background transition-colors" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                
                <FormField
                  control={form.control}
                  name="type"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t('orgs.type')} <span className="text-destructive">*</span></FormLabel>
                      <Select onValueChange={field.onChange} defaultValue={field.value}>
                        <FormControl>
                          <SelectTrigger className="bg-muted/30 focus:bg-background transition-colors">
                            <SelectValue placeholder="Select type" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent dir={dir}>
                          <SelectItem value="CHARITY">{lang === 'ar' ? 'جمعية خيرية' : 'Charity'}</SelectItem>
                          <SelectItem value="FOUNDATION">{lang === 'ar' ? 'مؤسسة أهلية' : 'Foundation'}</SelectItem>
                          <SelectItem value="NGO">{lang === 'ar' ? 'منظمة غير ربحية' : 'NGO'}</SelectItem>
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="registrationNumber"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t('orgs.registration')}</FormLabel>
                      <FormControl>
                        <Input placeholder="e.g. 12345" {...field} className="bg-muted/30 focus:bg-background transition-colors" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="email"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t('orgs.email')}</FormLabel>
                      <FormControl>
                        <Input type="email" placeholder="contact@org.com" dir="ltr" {...field} className="bg-muted/30 focus:bg-background transition-colors" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="phone"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t('orgs.phone')}</FormLabel>
                      <FormControl>
                        <Input placeholder="+966..." dir="ltr" {...field} className="bg-muted/30 focus:bg-background transition-colors" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="city"
                  render={({ field }) => (
                    <FormItem className="md:col-span-2">
                      <FormLabel>{t('orgs.city')}</FormLabel>
                      <FormControl>
                        <Input placeholder={lang === 'ar' ? 'الرياض، جدة...' : 'Riyadh, Jeddah...'} {...field} className="bg-muted/30 focus:bg-background transition-colors" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              <div className="flex justify-end pt-4 border-t border-border/50">
                <Button type="submit" disabled={createOrg.isPending} className="w-full sm:w-auto px-8">
                  {createOrg.isPending ? t('common.loading') : t('orgs.submit')}
                </Button>
              </div>
            </form>
          </Form>
        </CardContent>
      </Card>
    </div>
  );
}
